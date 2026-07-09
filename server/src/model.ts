// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

/**
 * Shared coverage model and source-path matching.
 *
 * A {@link Coverage} maps each known source file to the state of each of its
 * lines. Keys are normalized (forward-slash) path strings exactly as they
 * appear in the report (e.g. `com/example/Foo.java` for jacoco,
 * `src/main.rs` for lcov). Matching against an editor document path is done by
 * {@link Coverage.linesFor}.
 */

/** Coverage state for a single source line. */
export enum LineState {
  /** Executable line that was hit by the tests. */
  Covered = "covered",
  /** Executable line that was never hit. */
  Uncovered = "uncovered",
  /** Line partially covered (e.g. some branches taken, some missed). */
  Partial = "partial",
}

/** Per-line coverage for one file: 1-based line number -> state. */
export type LineMap = Map<number, LineState>;

/** Normalize a path for comparison: backslashes to forward slashes. */
export function normalize(s: string): string {
  return s.replace(/\\/g, "/");
}

/** When two records disagree about a line, prefer the most-covered verdict. */
function mergeState(a: LineState, b: LineState): LineState {
  if (a === LineState.Covered || b === LineState.Covered) return LineState.Covered;
  if (a === LineState.Partial || b === LineState.Partial) return LineState.Partial;
  return LineState.Uncovered;
}

export class Coverage {
  private files = new Map<string, LineMap>();

  /** Number of files with coverage data. */
  get fileCount(): number {
    return this.files.size;
  }

  /**
   * Merge a file's line map into the model. If the same file (or line) is
   * inserted more than once, the "more covered" state wins so that two records
   * for one file never downgrade a hit to a miss.
   */
  insertFile(key: string, lines: LineMap): void {
    if (lines.size === 0) return;
    const target = normalize(key);
    let entry = this.files.get(target);
    if (!entry) {
      entry = new Map();
      this.files.set(target, entry);
    }
    for (const [line, state] of lines) {
      const existing = entry.get(line);
      entry.set(line, existing === undefined ? state : mergeState(existing, state));
    }
  }

  /** Merge another parsed report into this one. */
  merge(other: Coverage): void {
    for (const [key, lines] of other.files) {
      this.insertFile(key, lines);
    }
  }

  /**
   * Look up the line states for an editor document path.
   *
   * Tries, in order: exact normalized match, suffix match in either direction
   * (report paths are usually relative, editor paths absolute), then a
   * last-resort basename match.
   */
  linesFor(path: string): LineMap | undefined {
    const target = normalize(path);

    const exact = this.files.get(target);
    if (exact) return exact;

    for (const [key, lines] of this.files) {
      if (target.endsWith(key) || key.endsWith(target)) return lines;
    }

    const fname = target.split("/").pop();
    if (fname) {
      for (const [key, lines] of this.files) {
        if (key.split("/").pop() === fname) return lines;
      }
    }
    return undefined;
  }
}
