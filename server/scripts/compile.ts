// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

/**
 * Compile the language server into a standalone binary with `bun --compile`.
 *
 *   bun run scripts/compile.ts                 # host platform
 *   bun run scripts/compile.ts all             # every supported platform
 *   bun run scripts/compile.ts <rust-triple>   # one platform
 *
 * Binaries are written to `dist/covhl-<rust-triple>[.exe]`, named by the Rust
 * target triple so the Zed extension can map `zed::current_platform()` straight
 * onto the release asset. The release workflow gzips each one.
 */

import { $ } from "bun";

// Rust target triple -> bun --target
const TARGETS: Record<string, string> = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
};

function hostTriple(): string {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  return `${arch}-unknown-linux-gnu`;
}

async function build(triple: string): Promise<void> {
  const target = TARGETS[triple];
  if (!target) throw new Error(`unknown target triple: ${triple}`);
  const ext = triple.includes("windows") ? ".exe" : "";
  const outfile = `dist/covhl-${triple}${ext}`;
  console.log(`building ${outfile}  (${target})`);
  await $`bun build src/server.ts --compile --target=${target} --minify --outfile ${outfile}`;
}

const arg = process.argv[2];
const triples = arg === "all" ? Object.keys(TARGETS) : [arg ?? hostTriple()];
for (const triple of triples) {
  await build(triple);
}
