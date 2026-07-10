import { describe, expect, test } from "bun:test";

import { uriToPath } from "../src/uri.js";

describe("uriToPath", () => {
  test("converts file:// URIs to filesystem paths", () => {
    expect(uriToPath("file:///tmp/lcov.info")).toBe("/tmp/lcov.info");
    expect(uriToPath("file:///a%20b/c.ts")).toBe("/a b/c.ts");
  });

  test("rejects non-file schemes and malformed URIs", () => {
    expect(uriToPath("untitled:Untitled-1")).toBeUndefined();
    expect(uriToPath("https://example.com/x")).toBeUndefined();
    expect(uriToPath("file://%")).toBeUndefined();
  });
});
