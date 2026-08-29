/**
 * Small, conservative filters for commands with predictable boilerplate.
 * These filters only remove known noise or cap unusually long listings;
 * diagnostics and command output are otherwise passed through unchanged.
 */
import { registerFilter, type FilterResult } from "./dispatch.js";

type Rule = {
  command: string;
  label: string;
  strip?: readonly RegExp[];
  maxLines?: number;
};

const RULES: readonly Rule[] = [
  {
    command: "rsync", label: "rsync",
    strip: [/^sending incremental file list$/, /^sent [\d,]+ bytes\s+.*$/, /^total size is /],
    maxLines: 100,
  },
  {
    command: "wget", label: "wget",
    strip: [/^Resolving /, /^Connecting to /, /^HTTP request sent/, /^\s*\d+[KMG]?\s+/, /^\s*\d+%/],
    maxLines: 20,
  },
  { command: "brew install", label: "brew install", strip: [/^==> (Downloading|Fetching|Installing|Pouring|Caveats)/], maxLines: 30 },
  { command: "bundle install", label: "bundle install", strip: [/^Using /, /^Fetching /, /^Installing /], maxLines: 40 },
  { command: "composer install", label: "composer install", strip: [/^\s*- Installing /, /^Loading composer repositories/], maxLines: 40 },
  { command: "df", label: "df", maxLines: 30 },
  { command: "ps", label: "ps", maxLines: 40 },
  { command: "systemctl status", label: "systemctl status", maxLines: 40 },
  { command: "ping", label: "ping", maxLines: 10 },
  { command: "shellcheck", label: "shellcheck", maxLines: 80 },
  { command: "yamllint", label: "yamllint", maxLines: 80 },
];

function filterStandard(stdout: string, command: string, rule: Rule): FilterResult | null {
  const input = stdout.split("\n");
  const kept = input.filter((line) => !(rule.strip ?? []).some((pattern) => pattern.test(line)));
  const removed = input.length - kept.length;

  let outputLines = kept;
  let capped = 0;
  if (rule.maxLines !== undefined && outputLines.length > rule.maxLines) {
    const tail = Math.min(5, rule.maxLines);
    outputLines = [...outputLines.slice(0, rule.maxLines - tail), ...outputLines.slice(-tail)];
    capped = kept.length - outputLines.length;
  }

  if (removed < 3 && capped === 0) return null;
  const result = outputLines.filter((line, index, lines) => index < lines.length - 1 || line !== "");
  result.push(`(${removed} noise lines stripped${capped ? `, ${capped} lines capped` : ""})`);
  return { output: result.join("\n"), category: "fast" };
}

for (const rule of RULES) {
  registerFilter(rule.command, (stdout, command) => filterStandard(stdout, command, rule), "fast");
}
