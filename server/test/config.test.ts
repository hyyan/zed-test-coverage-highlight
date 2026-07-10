import { describe, expect, test } from "bun:test";

import { Config, parseColor } from "../src/config.js";
import { LineState } from "../src/model.js";

describe("parseColor accepts any CSS format", () => {
  test("hex, rgb, hsl and named all normalize to 0..1", () => {
    const hex = parseColor("#1fca6f")!;
    expect(hex.red).toBeCloseTo(31 / 255, 5);
    expect(hex.green).toBeCloseTo(202 / 255, 5);
    expect(parseColor("rgb(31,202,111)")).toEqual(hex);
    expect(parseColor("forestgreen")).toBeDefined();
    expect(parseColor("hsl(147,74%,46%)")).toBeDefined();
  });

  test("an explicit alpha becomes a per-colour override", () => {
    expect(parseColor("rgba(0,0,0,0.5)")!.alpha).toBeCloseTo(0.5, 5);
    expect(parseColor("#000000")!.alpha).toBeUndefined(); // opaque -> use global alpha
  });

  test("invalid input is rejected", () => {
    expect(parseColor("not-a-color")).toBeUndefined();
    expect(parseColor("")).toBeUndefined();
    expect(parseColor(42)).toBeUndefined();
  });
});

describe("apply", () => {
  test("overrides flags, alpha (clamped) and colours", () => {
    const cfg = new Config();
    cfg.apply({
      enabled: false,
      showHover: false,
      showCodeLens: false,
      autoRefresh: false,
      alpha: 2,
      coveragePath: "target/site/jacoco/jacoco.xml",
      colors: { covered: "#0000ff" },
    });
    expect(cfg.enabled).toBe(false);
    expect(cfg.showHover).toBe(false);
    expect(cfg.showCodeLens).toBe(false);
    expect(cfg.autoRefresh).toBe(false);
    expect(cfg.alpha).toBe(1); // clamped to [0,1]
    expect(cfg.coveragePath).toBe("target/site/jacoco/jacoco.xml");
    const covered = cfg.colorFor(LineState.Covered)!;
    expect(covered.blue).toBe(1);
    expect(covered.alpha).toBe(1); // no per-colour alpha -> global
  });

  test("ignores non-object input and keeps defaults", () => {
    const cfg = new Config();
    cfg.apply(undefined);
    cfg.apply("nope");
    expect(cfg.enabled).toBe(true);
    expect(cfg.colorFor(LineState.Uncovered)!.red).toBeCloseTo(0.9, 5);
  });

  test("a colour's own alpha overrides the global alpha", () => {
    const cfg = new Config();
    cfg.apply({ alpha: 0.2, colors: { partial: "rgba(10,20,30,0.7)", covered: "green" } });
    expect(cfg.colorFor(LineState.Partial)!.alpha).toBeCloseTo(0.7, 5);
    expect(cfg.colorFor(LineState.Covered)!.alpha).toBeCloseTo(0.2, 5);
  });

  test("covered is not highlighted by default; null disables a highlight", () => {
    const cfg = new Config();
    expect(cfg.colorFor(LineState.Covered)).toBeUndefined();
    expect(cfg.colorFor(LineState.Uncovered)).toBeDefined();
    cfg.apply({ colors: { covered: "green", uncovered: null } });
    expect(cfg.colorFor(LineState.Covered)).toBeDefined();
    expect(cfg.colorFor(LineState.Uncovered)).toBeUndefined();
  });
});
