/**
 * Loads, merges and refreshes coverage reports for a workspace root.
 *
 * Multi-module projects emit several reports, so every discovered report is
 * parsed and merged. {@link CoverageStore.reloadIfChanged} re-reads whenever a
 * known report's mtime changes (or a new one appears), so re-running the tests
 * updates coverage without restarting the server. It returns whether the set of
 * reports actually changed, which the server uses to decide when to nudge open
 * editors into re-pulling their colors.
 */

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { findReports } from "./discovery.js";
import { Coverage, type LineMap } from "./model.js";
import { parse } from "./parse.js";

interface SeenReport {
  path: string;
  mtimeMs: number;
}

export class CoverageStore {
  private coverage = new Coverage();
  private reports: SeenReport[] = [];
  private ready: Promise<void>;

  constructor(
    private root: string,
    private configuredPath: string | undefined = undefined,
  ) {
    this.ready = this.load();
  }

  /** Resolves once the initial scan has completed. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  setConfiguredPath(path: string | undefined): Promise<void> {
    this.configuredPath = path;
    this.ready = this.load();
    return this.ready;
  }

  linesFor(path: string): LineMap | undefined {
    return this.coverage.linesFor(path);
  }

  /**
   * Re-scan if a known report changed or none are known yet. Returns true when
   * the set of reports (by path + mtime) actually changed.
   */
  async reloadIfChanged(): Promise<boolean> {
    const knownChanged = this.reports.some((r) => mtimeOf(r.path) !== r.mtimeMs);
    if (this.reports.length > 0 && !knownChanged) return false;
    const before = this.signature();
    await this.load();
    return this.signature() !== before;
  }

  private async load(): Promise<void> {
    const coverage = new Coverage();
    const reports: SeenReport[] = [];
    for (const path of this.reportFiles()) {
      let content: string;
      try {
        content = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      try {
        coverage.merge(await parse(content));
      } catch {
        // A malformed or misdetected report should not sink the others.
      }
      const mtimeMs = mtimeOf(path);
      if (mtimeMs !== undefined) reports.push({ path, mtimeMs });
    }
    this.coverage = coverage;
    this.reports = reports;
  }

  private reportFiles(): string[] {
    if (this.configuredPath) {
      const configured = isAbsolute(this.configuredPath)
        ? this.configuredPath
        : join(this.root, this.configuredPath);
      if (isFile(configured)) return [configured];
    }
    return findReports(this.root);
  }

  private signature(): string {
    return this.reports
      .map((r) => `${r.path}:${r.mtimeMs}`)
      .sort()
      .join("|");
  }
}

function mtimeOf(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
