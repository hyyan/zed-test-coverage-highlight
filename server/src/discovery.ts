/**
 * Report discovery, matching vscode-coverage-gutters' defaults: find every
 * report by file name at any depth. `target`/`build` are NOT skipped, since
 * that is where jacoco reports live.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Report file names (`coverageFileNames`). */
export const REPORT_FILE_NAMES = new Set([
  "lcov.info",
  "cov.xml",
  "coverage.xml",
  "cobertura.xml",
  "jacoco.xml",
  "coverage.cobertura.xml",
  "clover.xml",
]);

/** Directories to skip (`ignoredPathGlobs`), plus `.git`. */
const IGNORED_DIRS = new Set(["node_modules", "venv", ".venv", "vendor", ".git"]);

const MAX_DEPTH = 12;

export function findReports(root: string): string[] {
  const found: string[] = [];
  const stack: Array<[string, number]> = [[root, 0]];

  while (stack.length > 0) {
    const [dir, depth] = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !IGNORED_DIRS.has(entry.name)) {
          stack.push([join(dir, entry.name), depth + 1]);
        }
      } else if (entry.isFile() && REPORT_FILE_NAMES.has(entry.name)) {
        found.push(join(dir, entry.name));
      }
    }
  }
  return found;
}
