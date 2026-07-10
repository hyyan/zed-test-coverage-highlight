import { describe, expect, test } from "bun:test";

import { Config } from "../src/config.js";
import { LineState } from "../src/model.js";
import { codeLens, documentColors, hover, summarize } from "../src/render.js";

function states(): Map<number, LineState> {
  return new Map([
    [1, LineState.Covered],
    [2, LineState.Uncovered],
    [4, LineState.Partial],
  ]);
}

describe("documentColors", () => {
  test("one whole-line color per known line (0-based, spans to next line)", () => {
    const cfg = new Config();
    cfg.apply({ colors: { covered: "rgb(46,204,112)" } }); // opt in to covered
    const colors = documentColors(states(), cfg);
    expect(colors).toHaveLength(3);
    const line1 = colors.find((c) => c.range.start.line === 0)!;
    expect(line1.range.end).toEqual({ line: 1, character: 0 });
    expect(line1.color.green).toBeCloseTo(204 / 255, 5); // covered = green
  });

  test("covered lines are not painted by default; null skips a state", () => {
    const byDefault = documentColors(states(), new Config());
    expect(byDefault).toHaveLength(2); // uncovered + partial only
    const cfg = new Config();
    cfg.apply({ colors: { uncovered: null, partial: null } });
    expect(documentColors(states(), cfg)).toHaveLength(0);
  });

  test("returns nothing when disabled", () => {
    const cfg = new Config();
    cfg.apply({ enabled: false });
    expect(documentColors(states(), cfg)).toHaveLength(0);
  });
});

describe("summarize", () => {
  test("covered + partial count as hit", () => {
    expect(summarize(states())).toEqual({ hit: 2, total: 3, percent: (2 / 3) * 100 });
    expect(summarize(new Map())).toEqual({ hit: 0, total: 0, percent: 0 });
  });
});

describe("hover", () => {
  test("percentage plus this line's status", () => {
    const cfg = new Config();
    expect(hover(states(), 0, cfg)).toContain("**File coverage: 67%** (2/3 lines covered)");
    expect(hover(states(), 0, cfg)).toContain("covered");
    expect(hover(states(), 1, cfg)).toContain("not covered");
    expect(hover(states(), 3, cfg)).toContain("partially covered");
  });

  test("no note for a line without coverage data", () => {
    const cfg = new Config();
    const text = hover(states(), 2, cfg)!; // line 3 (0-based 2) has no data
    expect(text).toBe("**File coverage: 67%** (2/3 lines covered)");
  });

  test("suppressed when showHover is false or there is no data", () => {
    const off = new Config();
    off.apply({ showHover: false });
    expect(hover(states(), 0, off)).toBeUndefined();
    expect(hover(new Map(), 0, new Config())).toBeUndefined();
  });
});

describe("codeLens", () => {
  test("one summary lens at the top of the file, wired to the toggle command", () => {
    const lens = codeLens(states(), new Config(), "covhl.toggle")!;
    expect(lens.range.start).toEqual({ line: 0, character: 0 });
    expect(lens.range.end).toEqual({ line: 0, character: 0 });
    expect(lens.command.title).toBe("Coverage: 67% (2/3 lines covered)");
    expect(lens.command.command).toBe("covhl.toggle");
  });

  test("suppressed when showCodeLens is false or there is no data", () => {
    const off = new Config();
    off.apply({ showCodeLens: false });
    expect(codeLens(states(), off, "covhl.toggle")).toBeUndefined();
    expect(codeLens(new Map(), new Config(), "covhl.toggle")).toBeUndefined();
  });
});
