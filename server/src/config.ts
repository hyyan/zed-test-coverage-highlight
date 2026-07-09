// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

/**
 * User settings, read from the LSP initialization options and from live
 * `workspace/didChangeConfiguration` updates. In Zed these live under
 * `lsp.covhl.settings.*` (or `.initialization_options.*`) in settings.json.
 *
 * Colours accept any CSS format (named, hex, rgb/rgba, hsl, hwb, ...) via the
 * `color` package. A colour that carries its own alpha overrides the global
 * `alpha`; otherwise the global `alpha` is applied.
 */

import Color from "color";

import { LineState } from "./model.js";

export interface CoverageColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** Normalized colour: components in 0..1, with an optional per-colour alpha. */
interface StoredColor {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
}

const DEFAULTS = {
  enabled: true,
  showHover: true,
  autoRefresh: true,
  alpha: 0.2,
  covered: { red: 0.18, green: 0.8, blue: 0.44 } as StoredColor,
  uncovered: { red: 0.9, green: 0.3, blue: 0.3 } as StoredColor,
  partial: { red: 0.95, green: 0.77, blue: 0.2 } as StoredColor,
};

export class Config {
  enabled = DEFAULTS.enabled;
  showHover = DEFAULTS.showHover;
  autoRefresh = DEFAULTS.autoRefresh;
  alpha = DEFAULTS.alpha;
  coveragePath: string | undefined;
  private covered: StoredColor = DEFAULTS.covered;
  private uncovered: StoredColor = DEFAULTS.uncovered;
  private partial: StoredColor = DEFAULTS.partial;

  colorFor(state: LineState): CoverageColor {
    const c =
      state === LineState.Covered
        ? this.covered
        : state === LineState.Partial
          ? this.partial
          : this.uncovered;
    return { red: c.red, green: c.green, blue: c.blue, alpha: c.alpha ?? this.alpha };
  }

  /** Apply a settings object (from initialization options or a live update). */
  apply(opts: unknown): void {
    if (!opts || typeof opts !== "object") return;
    const o = opts as Record<string, unknown>;

    if (typeof o["enabled"] === "boolean") this.enabled = o["enabled"];
    if (typeof o["showHover"] === "boolean") this.showHover = o["showHover"];
    if (typeof o["autoRefresh"] === "boolean") this.autoRefresh = o["autoRefresh"];
    if (typeof o["coveragePath"] === "string") this.coveragePath = o["coveragePath"];
    if (typeof o["alpha"] === "number") this.alpha = clamp(o["alpha"], 0, 1);

    const colors = o["colors"];
    if (colors && typeof colors === "object") {
      const c = colors as Record<string, unknown>;
      this.covered = parseColor(c["covered"]) ?? this.covered;
      this.uncovered = parseColor(c["uncovered"]) ?? this.uncovered;
      this.partial = parseColor(c["partial"]) ?? this.partial;
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Parse any CSS colour string into a normalized colour, or undefined. */
export function parseColor(value: unknown): StoredColor | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  try {
    const c = Color(value);
    const alpha = c.alpha();
    return {
      red: c.red() / 255,
      green: c.green() / 255,
      blue: c.blue() / 255,
      // Only treat a colour's alpha as an override when it is not fully opaque.
      alpha: alpha < 1 ? alpha : undefined,
    };
  } catch {
    return undefined;
  }
}
