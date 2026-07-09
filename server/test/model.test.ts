// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

import { describe, expect, test } from "bun:test";

import { Coverage, LineState, normalize } from "../src/model.js";

function map(pairs: Array<[number, LineState]>): Map<number, LineState> {
  return new Map(pairs);
}

test("normalize turns backslashes into forward slashes", () => {
  expect(normalize("a\\b\\c")).toBe("a/b/c");
});

describe("path matching", () => {
  test("exact, suffix and basename fallback", () => {
    const cov = new Coverage();
    cov.insertFile("com/example/Foo.java", map([[1, LineState.Covered]]));

    expect(cov.linesFor("com/example/Foo.java")).toBeDefined(); // exact
    expect(cov.linesFor("/proj/src/main/java/com/example/Foo.java")).toBeDefined(); // suffix
    cov.insertFile("weird/path/Widget.java", map([[1, LineState.Covered]]));
    expect(cov.linesFor("/other/tree/Widget.java")).toBeDefined(); // basename
    expect(cov.linesFor("com/example/Bar.java")).toBeUndefined();
  });
});

describe("merge", () => {
  test("prefers the more-covered verdict, never downgrades", () => {
    const cov = new Coverage();
    cov.insertFile("a.ts", map([[1, LineState.Uncovered]]));
    cov.insertFile("a.ts", map([[1, LineState.Covered]]));
    expect(cov.linesFor("a.ts")!.get(1)).toBe(LineState.Covered);
    expect(cov.fileCount).toBe(1);
  });

  test("partial beats uncovered but loses to covered", () => {
    const cov = new Coverage();
    cov.insertFile("a.ts", map([[1, LineState.Uncovered]]));
    cov.insertFile("a.ts", map([[1, LineState.Partial]]));
    expect(cov.linesFor("a.ts")!.get(1)).toBe(LineState.Partial);
  });

  test("merge(other) folds a whole report in", () => {
    const a = new Coverage();
    a.insertFile("a.ts", map([[1, LineState.Covered]]));
    const b = new Coverage();
    b.insertFile("b.ts", map([[2, LineState.Uncovered]]));
    a.merge(b);
    expect(a.fileCount).toBe(2);
    expect(a.linesFor("b.ts")!.get(2)).toBe(LineState.Uncovered);
  });

  test("empty line map inserts nothing", () => {
    const cov = new Coverage();
    cov.insertFile("empty.ts", new Map());
    expect(cov.fileCount).toBe(0);
  });
});
