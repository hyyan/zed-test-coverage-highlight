/**
 * User settings, read from the LSP initialization options and from live
 * `workspace/didChangeConfiguration` updates. In Zed these live under
 * `lsp.covhl.settings.*` (or `.initialization_options.*`) in settings.json.
 *
 * Colours accept any CSS format (named, hex, rgb/rgba, hsl, hwb, ...) via the
 * `color` package. A colour that carries its own alpha overrides the global
 * `alpha`; otherwise the global `alpha` is applied. `null` means "do not
 * highlight lines in this state" — the default for covered lines, so only
 * uncovered/partial lines are painted unless the user opts in.
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
  showCodeLens: true,
  autoRefresh: true,
  alpha: 0.2,
  covered: null as StoredColor | null,
  uncovered: { red: 0.9, green: 0.3, blue: 0.3 } as StoredColor | null,
  partial: { red: 0.95, green: 0.77, blue: 0.2 } as StoredColor | null,
};

export class Config {
  enabled = DEFAULTS.enabled;
  showHover = DEFAULTS.showHover;
  showCodeLens = DEFAULTS.showCodeLens;
  autoRefresh = DEFAULTS.autoRefresh;
  alpha = DEFAULTS.alpha;
  coveragePath: string | undefined;
  private covered = DEFAULTS.covered;
  private uncovered = DEFAULTS.uncovered;
  private partial = DEFAULTS.partial;

  /** The colour for a line state, or undefined when that state is not highlighted. */
  colorFor(state: LineState): CoverageColor | undefined {
    const c =
      state === LineState.Covered
        ? this.covered
        : state === LineState.Partial
          ? this.partial
          : this.uncovered;
    if (!c) return undefined;
    return { red: c.red, green: c.green, blue: c.blue, alpha: c.alpha ?? this.alpha };
  }

  /** Apply a settings object (from initialization options or a live update). */
  apply(opts: unknown): void {
    if (!opts || typeof opts !== "object") return;
    const o = opts as Record<string, unknown>;

    if (typeof o["enabled"] === "boolean") this.enabled = o["enabled"];
    if (typeof o["showHover"] === "boolean") this.showHover = o["showHover"];
    if (typeof o["showCodeLens"] === "boolean") this.showCodeLens = o["showCodeLens"];
    if (typeof o["autoRefresh"] === "boolean") this.autoRefresh = o["autoRefresh"];
    if (typeof o["coveragePath"] === "string") this.coveragePath = o["coveragePath"];
    if (typeof o["alpha"] === "number") this.alpha = clamp(o["alpha"], 0, 1);

    const colors = o["colors"];
    if (colors && typeof colors === "object") {
      const c = colors as Record<string, unknown>;
      this.covered = applyColor(c["covered"], this.covered);
      this.uncovered = applyColor(c["uncovered"], this.uncovered);
      this.partial = applyColor(c["partial"], this.partial);
    }
  }
}

/** `null` disables the highlight, a valid CSS string sets it, anything else keeps `current`. */
function applyColor(value: unknown, current: StoredColor | null): StoredColor | null {
  if (value === null) return null;
  return parseColor(value) ?? current;
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
