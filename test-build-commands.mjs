#!/usr/bin/env node
/** Regression tests for make and CMake build/configure output. */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = new URL(".", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "cm-build-"));
spawnSync("cp", ["-r", join(repo, "filters"), tmp]);
const tsc = spawnSync("npx", ["-y", "-p", "typescript@5.9", "tsc",
  "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck", "--strict", "false",
  "--outDir", join(tmp, "out"), "--rootDir", join(tmp, "filters"),
  join(tmp, "filters", "dispatch.ts"), join(tmp, "filters", "build.ts"),
], { encoding: "utf8" });
if (tsc.status !== 0) {
  console.error(tsc.stdout); console.error(tsc.stderr); process.exit(1);
}
const { dispatch } = await import(join(tmp, "out", "dispatch.js"));
await import(join(tmp, "out", "build.js"));

let fails = 0;
function check(name, pass, detail = "") {
  if (pass) console.log(`  PASS  ${name}`);
  else { console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); fails++; }
}

const makeOutput = [
  "make[1]: Entering directory '/work/project'",
  "make[2]: Entering directory '/work/project/src'",
  "gcc -O2 -Wall -c src/main.c -o build/main.o",
  "make[2]: Leaving directory '/work/project/src'",
  "make[1]: Leaving directory '/work/project'",
  "make[1]: Entering directory '/work/project'",
  "make[1]: Nothing to be done for 'all'.",
  "make[1]: Leaving directory '/work/project'",
  "Build complete: build/app",
].join("\n");
const makeResult = dispatch("make -j8 all", makeOutput);
check("make strips recursive directory/progress noise", makeResult !== null &&
  makeResult.output.includes("Build complete: build/app") &&
  !makeResult.output.includes("Entering directory") &&
  !makeResult.output.includes("Leaving directory"), JSON.stringify(makeResult));

const configureOutput = [
  "-- The C compiler identification is GNU 14.2.0",
  "-- The CXX compiler identification is GNU 14.2.0",
  "-- Detecting C compiler ABI info",
  "-- Detecting C compiler ABI info - done",
  "-- Check for working C compiler: /usr/bin/cc - skipped",
  "-- Detecting CXX compiler ABI info",
  "-- Detecting CXX compiler ABI info - done",
  "-- Configuring done",
  "-- Generating done",
  "-- Build files have been written to: /work/project/build",
  "Configure summary: project ready",
].join("\n");
const configureResult = dispatch("cmake -S . -B build", configureOutput);
check("cmake configure strips compiler/configuration noise", configureResult !== null &&
  configureResult.output.includes("Configure summary: project ready") &&
  !configureResult.output.includes("compiler identification") &&
  !configureResult.output.includes("Configuring done"), JSON.stringify(configureResult));

const cmakeBuildOutput = [
  "[ 10%] Building CXX object src/CMakeFiles/app.dir/main.cpp.o",
  "[ 20%] Building CXX object src/CMakeFiles/app.dir/lib.cpp.o",
  "[ 40%] Building CXX object src/CMakeFiles/app.dir/util.cpp.o",
  "[ 60%] Linking CXX executable app",
  "[ 80%] Built target app",
  "[100%] Built target tests",
  "[100%] Built target install",
  "Build finished successfully",
].join("\n");
const cmakeBuildResult = dispatch("cmake --build build --parallel 8", cmakeBuildOutput);
check("cmake --build strips percentage progress", cmakeBuildResult !== null &&
  cmakeBuildResult.output.includes("Build finished successfully") &&
  !cmakeBuildResult.output.includes("Building CXX") &&
  !cmakeBuildResult.output.includes("[ 10%]"), JSON.stringify(cmakeBuildResult));

// A similarly named command must not be treated as make.
const falsePositive = dispatch("makefile-inspect --verbose", makeOutput);
check("make prefix requires a command boundary", falsePositive === null,
  JSON.stringify(falsePositive));

if (fails > 0) process.exit(1);
console.log("\nPASS — make and CMake build filters.");
