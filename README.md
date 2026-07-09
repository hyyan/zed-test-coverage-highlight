# Test Coverage Highlight

A [Zed](https://zed.dev) extension that highlights test coverage directly in the
editor — covered lines green, uncovered red, partially-covered yellow — with a
coverage-percentage hover.

It reads **lcov, jacoco, cobertura and clover** reports, auto-discovers them
across multi-module projects, and merges them. Java (jacoco), Kotlin, Scala,
Groovy, Rust, JS/TS, Python, Go, C/C++, C#, Ruby, PHP and Dart are wired up.

## How it works

Zed extensions are sandboxed WASM and cannot draw gutters or decorations. The
only way to color code is the LSP `textDocument/documentColor` request, which
Zed renders according to its global `lsp_document_colors` setting. So this
extension ships a small language server (`covhl`) that attaches alongside your
real language server and answers `documentColor` (and `hover`) from your
coverage reports.

**Enable the rendering** in your Zed `settings.json`:

```json
{
  "lsp_document_colors": "background"
}
```

Options: `"background"` (recommended), `"border"`, `"inlay"`, or `"none"`.
Note this is a global Zed setting and also affects CSS color previews.

## Coverage reports

Reports are discovered by file name at any depth, skipping `node_modules`,
`venv`, `.venv`, `vendor` and `.git` (but **not** `target`/`build`, where jacoco
lives). Recognized names:

`lcov.info`, `jacoco.xml`, `cobertura.xml`, `coverage.xml`, `cov.xml`,
`coverage.cobertura.xml`, `clover.xml`.

Re-run your tests and the colors refresh automatically — no reload.

## Settings

Configure under `lsp.covhl.settings` in Zed `settings.json`:

```json
{
  "lsp": {
    "covhl": {
      "settings": {
        "enabled": true,
        "showHover": true,
        "autoRefresh": true,
        "alpha": 0.2,
        "coveragePath": "target/site/jacoco/jacoco.xml",
        "colors": {
          "covered": "#2ecc71",
          "uncovered": "rgba(231,76,60,0.35)",
          "partial": "hsl(48, 89%, 50%)"
        }
      }
    }
  }
}
```

- **enabled** — master switch.
- **showHover** — show the coverage-% hover.
- **autoRefresh** — nudge open editors to re-color when a report changes.
- **alpha** — fill opacity (0–1) for colors that don't carry their own alpha.
- **coveragePath** — pin a single report instead of auto-discovering.
- **colors** — any CSS color format (named, hex, `rgb()`, `rgba()`, `hsl()`, …).

Changes apply live, without restarting the server.

## Installing the server binary

The extension downloads the prebuilt `covhl` binary for your platform from this
repo's GitHub Releases. To use a local build instead, put a `covhl` binary on
your `$PATH` — the extension prefers it.

## Limitations

- No true gutter markers, footer button, status-bar percentage, or settings UI
  panel: none of those surfaces are available to Zed extensions. The hover is
  the percentage surface; whole-line background is the marker.
- `lsp_document_colors` is global and shared with CSS color previews.

## Development

```
server/        TypeScript language server (bun); parsers, tests, bun-compile
editors/zed/   the Zed extension (Rust/WASM shim that launches covhl)
```

```sh
cd server
bun install
bun test              # unit + end-to-end
bun run compile       # build the covhl binary for this platform -> dist/
```

## License

MIT © 2026 Hyyan Abo Fakher. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
