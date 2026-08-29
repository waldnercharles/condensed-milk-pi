#!/usr/bin/env node
/** Regression tests for the conservative ZTK-inspired command filters. */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = new URL(".", import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), "cm-standard-"));
spawnSync("cp", ["-r", join(repo, "filters"), tmp]);
const modules = ["dispatch", "standard-cli", "linter", "test-runners"];
const tsc = spawnSync("npx", ["-y", "-p", "typescript@5.9", "tsc",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler",
  "--skipLibCheck", "--strict", "false", "--outDir", join(tmp, "out"),
  "--rootDir", join(tmp, "filters"),
  ...modules.map((m) => join(tmp, "filters", `${m}.ts`)),
], { encoding: "utf8" });
if (tsc.status !== 0) { console.error(tsc.stdout, tsc.stderr); process.exit(1); }
const { dispatch } = await import(join(tmp, "out", "dispatch.js"));
for (const module of modules.slice(1)) await import(join(tmp, "out", `${module}.js`));

let failures = 0;
function check(name, value, detail = "") {
  if (value) console.log(`  PASS  ${name}`);
  else { console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); failures++; }
}

const rsync = dispatch("rsync -a src/ build/", [
  "sending incremental file list", "src/", "src/main.o", "src/lib.o",
  "sent 12,345 bytes  received 456 bytes  8,534.00 bytes/sec",
  "total size is 98,765  speedup is 7.71",
].join("\n"));
check("rsync strips transfer boilerplate", rsync !== null &&
  rsync.output.includes("src/main.o") && !rsync.output.includes("incremental") &&
  !rsync.output.includes("total size"));

const clang = dispatch("clang-format --dry-run --Werror src/*.cc", [
  ...Array.from({ length: 20 }, (_, i) =>
    `src/a.cc:${10 + i}:1: error: code should be clang-formatted [-Wclang-format-violations]`),
  "Checked 20 files",
].join("\n"));
check("clang-format dry-run aggregates diagnostics", clang !== null &&
  clang.output.includes("clang-format") && clang.output.includes("20 errors"), clang ? clang.output : "null");

const clangWrite = dispatch("clang-format src/main.cc", "formatted source output\n".repeat(20));
check("plain clang-format is not summarized", clangWrite === null);

const longPs = Array.from({ length: 60 }, (_, i) => `user ${i} 0.0 0.1 process-${i}`).join("\n");
const ps = dispatch("ps aux", longPs);
check("long ps output is bounded with a tail", ps !== null && ps.output.includes("process-59"));

if (failures) process.exit(1);
console.log("\nPASS — standard CLI and clang-format filters.");
