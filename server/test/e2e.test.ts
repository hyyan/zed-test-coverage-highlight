// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

/**
 * End-to-end: drive the server over stdio exactly as an editor would —
 * initialize, didOpen, documentColor, hover — against real lcov and jacoco
 * reports on disk. Prefers the compiled binary (dist/covhl-<host-triple>) and
 * falls back to running the TypeScript entry with bun.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { JACOCO } from "./fixtures.js";

function hostTriple(): string {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  return `${arch}-unknown-linux-gnu`;
}

function serverCommand(): string[] {
  const binary = join(import.meta.dir, "..", "dist", `covhl-${hostTriple()}`);
  return existsSync(binary) ? [binary] : ["bun", "run", join(import.meta.dir, "..", "src", "server.ts")];
}

/** A tiny LSP client speaking Content-Length framed JSON-RPC over stdio. */
class LspClient {
  private proc: ReturnType<typeof Bun.spawn>;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, (value: unknown) => void>();
  private nextId = 1;
  private reader: Promise<void>;

  constructor(cwd: string) {
    this.proc = Bun.spawn(serverCommand(), {
      cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    this.reader = this.readLoop();
  }

  private async readLoop(): Promise<void> {
    for await (const chunk of this.proc.stdout as ReadableStream<Uint8Array>) {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      this.drain();
    }
  }

  private drain(): void {
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) return;
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;
      const body = this.buffer.subarray(start, start + length).toString("utf8");
      this.buffer = this.buffer.subarray(start + length);
      const msg = JSON.parse(body) as { id?: number; result?: unknown };
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        this.pending.get(msg.id)!(msg.result);
        this.pending.delete(msg.id);
      }
    }
  }

  private get sink(): import("bun").FileSink {
    return this.proc.stdin as import("bun").FileSink;
  }

  private send(message: object): void {
    const body = JSON.stringify(message);
    this.sink.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    this.sink.flush();
  }

  request(method: string, params: unknown): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  async stop(): Promise<void> {
    this.notify("exit", null);
    this.sink.end();
    await this.proc.exited;
  }
}

let root: string;
let client: LspClient;
let fileUri: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "covhl-e2e-"));
  writeFileSync(join(root, "jacoco.xml"), JACOCO);
  const javaPath = join(root, "src/main/java/com/example/Foo.java");
  mkdirSync(join(javaPath, ".."), { recursive: true });
  writeFileSync(javaPath, "line1\nline2\nline3\nline4\n");
  fileUri = pathToFileURL(javaPath).href;

  client = new LspClient(root);
  const init = await client.request("initialize", {
    processId: process.pid,
    rootUri: pathToFileURL(root).href,
    capabilities: {},
    initializationOptions: {},
  });
  expect(init.capabilities.colorProvider).toBe(true);
  expect(init.capabilities.hoverProvider).toBe(true);
  client.notify("initialized", {});
  client.notify("textDocument/didOpen", {
    textDocument: { uri: fileUri, languageId: "java", version: 1, text: "line1\nline2\nline3\nline4\n" },
  });
});

afterAll(async () => {
  await client.stop();
  rmSync(root, { recursive: true, force: true });
});

describe("compiled server over stdio", () => {
  test("documentColor returns per-line colors from the jacoco report", async () => {
    const colors = await client.request("textDocument/documentColor", {
      textDocument: { uri: fileUri },
    });
    expect(Array.isArray(colors)).toBe(true);
    // Report covers lines 1 (covered), 2 (uncovered), 3 (partial): 0-based 0,1,2.
    const byLine = new Map<number, any>(colors.map((c: any) => [c.range.start.line, c.color]));
    expect(byLine.has(0)).toBe(true);
    expect(byLine.has(1)).toBe(true);
    expect(byLine.has(2)).toBe(true);
    expect(byLine.get(0).green).toBeGreaterThan(byLine.get(0).red); // covered -> greenish
    expect(byLine.get(1).red).toBeGreaterThan(byLine.get(1).green); // uncovered -> reddish
  });

  test("hover reports the file's coverage percentage and line status", async () => {
    const hover = await client.request("textDocument/hover", {
      textDocument: { uri: fileUri },
      position: { line: 0, character: 0 },
    });
    expect(hover.contents.value).toContain("Coverage:");
    expect(hover.contents.value).toContain("This line is covered");
  });
});
