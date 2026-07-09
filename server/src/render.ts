// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

/**
 * Pure rendering of a file's coverage into LSP document colors and hover text.
 * Kept free of any LSP connection state so it can be unit-tested directly.
 */

import type { Config } from "./config.js";
import { LineState, type LineMap } from "./model.js";

export interface ColorInformation {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  color: { red: number; green: number; blue: number; alpha: number };
}

/**
 * One document color per known line, filling the whole line width by spanning
 * to the start of the next line. The report itself tells us which lines to
 * color, so no document text is needed. Lines are 1-based in reports and
 * 0-based in LSP.
 */
export function documentColors(states: LineMap, config: Config): ColorInformation[] {
  if (!config.enabled) return [];
  const colors: ColorInformation[] = [];
  for (const [line, state] of states) {
    if (line < 1) continue;
    const idx = line - 1;
    colors.push({
      range: {
        start: { line: idx, character: 0 },
        end: { line: idx + 1, character: 0 },
      },
      color: config.colorFor(state),
    });
  }
  return colors;
}

export interface Summary {
  hit: number;
  total: number;
  percent: number;
}

/** Line-coverage summary: covered+partial lines over all executable lines. */
export function summarize(states: LineMap): Summary {
  const total = states.size;
  let hit = 0;
  for (const state of states.values()) {
    if (state === LineState.Covered || state === LineState.Partial) hit++;
  }
  const percent = total === 0 ? 0 : (hit / total) * 100;
  return { hit, total, percent };
}

/** Markdown hover for a 0-based line, or undefined when there is nothing to show. */
export function hover(
  states: LineMap,
  line0: number,
  config: Config,
): string | undefined {
  if (!config.showHover) return undefined;
  const { hit, total, percent } = summarize(states);
  if (total === 0) return undefined;

  const note =
    states.get(line0 + 1) === LineState.Covered
      ? "\n\n✓ This line is covered"
      : states.get(line0 + 1) === LineState.Uncovered
        ? "\n\n✗ This line is not covered"
        : states.get(line0 + 1) === LineState.Partial
          ? "\n\n◐ This line is partially covered"
          : "";

  return `**Coverage: ${percent.toFixed(0)}%** (${hit}/${total} lines)${note}`;
}
