// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

import { describe, expect, test } from "bun:test";

import { LineState } from "../src/model.js";
import { detectFormat, isXml, parse } from "../src/parse.js";
import { CLOVER, COBERTURA, JACOCO, LCOV } from "./fixtures.js";

describe("format detection", () => {
  test("isXml distinguishes xml from lcov", () => {
    expect(isXml(JACOCO)).toBe(true);
    expect(isXml(COBERTURA)).toBe(true);
    expect(isXml(LCOV)).toBe(false);
  });

  test("detectFormat routes each report to its parser", () => {
    expect(detectFormat(LCOV)).toBe("lcov");
    expect(detectFormat(JACOCO)).toBe("jacoco");
    expect(detectFormat(COBERTURA)).toBe("cobertura");
    expect(detectFormat(CLOVER)).toBe("clover");
  });
});

describe("lcov", () => {
  test("covered / uncovered / partial (branch) lines", async () => {
    const cov = await parse(LCOV);
    const lines = cov.linesFor("src/main.ts")!;
    expect(lines.get(1)).toBe(LineState.Covered);
    expect(lines.get(2)).toBe(LineState.Uncovered);
    expect(lines.get(3)).toBe(LineState.Partial);
  });
});

describe("jacoco", () => {
  test("parses through prolog + DTD; ci/mi drive state", async () => {
    const cov = await parse(JACOCO);
    const lines = cov.linesFor("com/example/Foo.java")!;
    expect(lines.get(1)).toBe(LineState.Covered);
    expect(lines.get(2)).toBe(LineState.Uncovered);
    expect(lines.get(3)).toBe(LineState.Partial);
  });
});

describe("cobertura", () => {
  test("hits + condition-coverage drive state", async () => {
    const cov = await parse(COBERTURA);
    const lines = cov.linesFor("src/foo.py")!;
    expect(lines.get(1)).toBe(LineState.Covered);
    expect(lines.get(2)).toBe(LineState.Uncovered);
    expect(lines.get(3)).toBe(LineState.Partial);
  });
});

describe("clover", () => {
  test("count drives state (clover exposes no branch data)", async () => {
    const cov = await parse(CLOVER);
    const lines = cov.linesFor("src/bar.js")!;
    expect(lines.get(1)).toBe(LineState.Covered);
    expect(lines.get(2)).toBe(LineState.Uncovered);
    expect(lines.get(3)).toBe(LineState.Covered);
  });
});

describe("malformed input", () => {
  test("empty / garbage yields no files, never throws", async () => {
    expect((await parse("")).fileCount).toBe(0);
    expect((await parse("not a report")).fileCount).toBe(0);
    expect((await parse("<coverage></coverage>")).fileCount).toBe(0);
  });
});
