/**
 * One-shot local dev setup: compile the host binary and symlink it onto the
 * PATH as `covhl`, so a dev-installed Zed extension finds it via
 * `worktree.which("covhl")` without needing a GitHub release.
 *
 *   bun run scripts/dev-setup.ts
 *
 * Re-run is harmless (rebuilds, re-links). The symlink follows future builds
 * automatically since it points at the dist output, not a copy.
 */

import { $ } from "bun";
import { existsSync } from "node:fs";
import { symlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function hostTriple(): string {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  return `${arch}-unknown-linux-gnu`;
}

if (process.platform === "win32") {
  console.error("dev-setup.ts supports macOS/Linux; on Windows add dist/ to PATH manually.");
  process.exit(1);
}

await $`bun run scripts/compile.ts`;
const binary = resolve(`dist/covhl-${hostTriple()}`);

// First writable, on-PATH location wins.
const pathDirs = (process.env["PATH"] ?? "").split(":");
const candidates = ["/usr/local/bin", join(homedir(), ".local", "bin"), join(homedir(), "bin")]
  .filter((dir) => existsSync(dir) && pathDirs.includes(dir));
if (candidates.length === 0) {
  console.error("No writable PATH directory found; link manually:");
  console.error(`  sudo ln -sf ${binary} /usr/local/bin/covhl`);
  process.exit(1);
}

const link = join(candidates[0]!, "covhl");
await unlink(link).catch(() => {});
await symlink(binary, link);

console.log(`
covhl -> ${link} -> ${binary}

Next steps in Zed:
  1. command palette -> "zed: install dev extension" -> pick editors/zed/
     (already installed? run "editor: restart language server" instead)
  2. settings.json: { "lsp_document_colors": "background" }
  3. open a project with a coverage report (lcov.info, jacoco.xml, ...)
`);
