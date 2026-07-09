// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LineState } from "../src/model.js";
import { CoverageStore } from "../src/store.js";
import { JACOCO } from "./fixtures.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "covhl-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** Push a file's mtime forward so change detection fires deterministically. */
function bumpMtime(path: string): void {
  const future = new Date(Date.now() + 10_000);
  utimesSync(path, future, future);
}

describe("discovery + parsing", () => {
  test("finds a nested jacoco report and matches by source path", async () => {
    write("app/target/site/jacoco/jacoco.xml", JACOCO);
    const store = new CoverageStore(root);
    await store.whenReady();
    const lines = store.linesFor("/anywhere/com/example/Foo.java");
    expect(lines?.get(1)).toBe(LineState.Covered);
    expect(lines?.get(3)).toBe(LineState.Partial);
  });

  test("merges reports across modules", async () => {
    write("mod-a/lcov.info", "SF:src/a.ts\nDA:1,1\nend_of_record\n");
    write("mod-b/lcov.info", "SF:src/b.ts\nDA:2,0\nend_of_record\n");
    const store = new CoverageStore(root);
    await store.whenReady();
    expect(store.linesFor("src/a.ts")?.get(1)).toBe(LineState.Covered);
    expect(store.linesFor("src/b.ts")?.get(2)).toBe(LineState.Uncovered);
  });
});

describe("reloadIfChanged", () => {
  test("false when unchanged, true after a report is rewritten", async () => {
    const path = write("lcov.info", "SF:src/a.ts\nDA:1,0\nend_of_record\n");
    const store = new CoverageStore(root);
    await store.whenReady();
    expect(store.linesFor("src/a.ts")?.get(1)).toBe(LineState.Uncovered);

    expect(await store.reloadIfChanged()).toBe(false);

    writeFileSync(path, "SF:src/a.ts\nDA:1,3\nend_of_record\n");
    bumpMtime(path);
    expect(await store.reloadIfChanged()).toBe(true);
    expect(store.linesFor("src/a.ts")?.get(1)).toBe(LineState.Covered);
  });

  test("picks up a report that appears after startup", async () => {
    const store = new CoverageStore(root);
    await store.whenReady();
    expect(store.linesFor("src/a.ts")).toBeUndefined();
    expect(await store.reloadIfChanged()).toBe(false); // still nothing

    write("lcov.info", "SF:src/a.ts\nDA:1,1\nend_of_record\n");
    expect(await store.reloadIfChanged()).toBe(true);
    expect(store.linesFor("src/a.ts")?.get(1)).toBe(LineState.Covered);
  });
});

describe("configured path", () => {
  test("pins a single report and ignores discovery", async () => {
    write("lcov.info", "SF:src/discovered.ts\nDA:1,1\nend_of_record\n");
    const pinned = write("custom/report.info", "SF:src/pinned.ts\nDA:9,1\nend_of_record\n");
    const store = new CoverageStore(root, pinned);
    await store.whenReady();
    expect(store.linesFor("src/pinned.ts")?.get(9)).toBe(LineState.Covered);
    expect(store.linesFor("src/discovered.ts")).toBeUndefined();
  });
});
