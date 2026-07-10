/**
 * Test-coverage language server.
 *
 * Attaches alongside each language's real LSP and answers
 * `textDocument/documentColor` with a color per covered / uncovered / partial
 * line, plus a coverage-percentage hover. Coverage is discovered from lcov,
 * jacoco, cobertura and clover reports under the workspace root.
 *
 * Refresh: LSP has no "re-pull document colors" request, so when a report (or a
 * setting) changes we nudge each open document with a no-op edit — insert then
 * delete one character — which makes the editor re-request its colors. This can
 * be turned off with the `autoRefresh` setting.
 */

import {
  createConnection,
  MarkupKind,
  ProposedFeatures,
  StreamMessageReader,
  StreamMessageWriter,
  TextDocumentSyncKind,
  type CodeAction,
  type CodeLens,
  type CodeLensParams,
  type ColorInformation,
  type DidChangeConfigurationParams,
  type DocumentColorParams,
  type Hover,
  type HoverParams,
  type InitializeParams,
  type InitializeResult,
  type WorkspaceEdit,
} from "vscode-languageserver/node.js";

import { Config } from "./config.js";
import { codeLens as renderCodeLens, documentColors, hover as renderHover } from "./render.js";
import { CoverageStore } from "./store.js";
import { uriToPath } from "./uri.js";

const LSP_NAME = "covhl";
const POLL_MS = 2500;
const TOGGLE_COMMAND = "covhl.toggleHighlight";

// Force a stdio transport so the binary works without a `--stdio` argument.
const connection = createConnection(
  ProposedFeatures.all,
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
);
const config = new Config();
const openDocs = new Set<string>();
let store: CoverageStore | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let clientCanRefreshCodeLenses = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
  config.apply(extractSettings(params.initializationOptions));
  store = new CoverageStore(rootPath(params), config.coveragePath);
  clientCanRefreshCodeLenses =
    params.capabilities.workspace?.codeLens?.refreshSupport ?? false;
  return {
    capabilities: {
      textDocumentSync: { openClose: true, change: TextDocumentSyncKind.None },
      colorProvider: true,
      hoverProvider: true,
      codeLensProvider: { resolveProvider: false },
      codeActionProvider: true,
      executeCommandProvider: { commands: [TOGGLE_COMMAND] },
    },
    serverInfo: { name: LSP_NAME, version: "0.1.0" },
  };
});

connection.onInitialized(() => {
  pollTimer = setInterval(() => void poll(), POLL_MS);
});

connection.onShutdown(() => {
  if (pollTimer) clearInterval(pollTimer);
});

connection.onDidOpenTextDocument((params) => {
  openDocs.add(params.textDocument.uri);
});

connection.onDidCloseTextDocument((params) => {
  openDocs.delete(params.textDocument.uri);
});

connection.onDocumentColor(
  async (params: DocumentColorParams): Promise<ColorInformation[]> => {
    if (!store || !config.enabled) return [];
    await store.whenReady();
    await store.reloadIfChanged();
    const states = statesFor(params.textDocument.uri);
    return states ? documentColors(states, config) : [];
  },
);

connection.onHover(async (params: HoverParams): Promise<Hover | null> => {
  if (!store || !config.showHover) return null;
  await store.whenReady();
  const states = statesFor(params.textDocument.uri);
  if (!states) return null;
  const value = renderHover(states, params.position.line, config);
  return value ? { contents: { kind: MarkupKind.Markdown, value } } : null;
});

// File coverage summary as a code lens; Zed renders lenses only when the
// user sets `"code_lens": "on"`.
connection.onCodeLens(async (params: CodeLensParams): Promise<CodeLens[]> => {
  if (!store || !config.showCodeLens) return [];
  await store.whenReady();
  await store.reloadIfChanged();
  const states = statesFor(params.textDocument.uri);
  const lens = states ? renderCodeLens(states, config, TOGGLE_COMMAND) : undefined;
  return lens ? [lens] : [];
});

// Zed cannot bind editor commands to an extension, so the on/off switch is
// exposed as a code action ("cmd-." on any line).
connection.onCodeAction((): CodeAction[] => [
  {
    title: config.enabled
      ? "Coverage: disable highlighting"
      : "Coverage: enable highlighting",
    kind: "source",
    command: { title: "Toggle coverage highlighting", command: TOGGLE_COMMAND },
  },
]);

connection.onExecuteCommand(async (params) => {
  if (params.command !== TOGGLE_COMMAND) return;
  config.enabled = !config.enabled;
  await nudgeAll(true);
});

connection.onDidChangeConfiguration(async (params: DidChangeConfigurationParams) => {
  const previousPath = config.coveragePath;
  config.apply(extractSettings(params.settings));
  if (store && config.coveragePath !== previousPath) {
    await store.setConfiguredPath(config.coveragePath);
  }
  await nudgeAll();
});

function statesFor(uri: string) {
  const path = uriToPath(uri);
  return path ? store?.linesFor(path) : undefined;
}

async function poll(): Promise<void> {
  if (!store) return;
  const changed = await store.reloadIfChanged();
  if (changed) await nudgeAll();
}

/** Nudge every open document so the editor re-pulls its coverage colors. */
async function nudgeAll(force = false): Promise<void> {
  if (!config.autoRefresh && !force) return;
  if (clientCanRefreshCodeLenses) {
    try {
      await connection.sendRequest("workspace/codeLens/refresh");
    } catch {
      // Lenses still refresh on the next document change.
    }
  }
  for (const uri of openDocs) {
    await nudge(uri);
  }
}

async function nudge(uri: string): Promise<void> {
  const insert: WorkspaceEdit = {
    changes: {
      [uri]: [{ range: range(0, 0, 0, 0), newText: " " }],
    },
  };
  const remove: WorkspaceEdit = {
    changes: {
      [uri]: [{ range: range(0, 0, 0, 1), newText: "" }],
    },
  };
  try {
    // Two round-trips: sending both edits at once can apply the delete first.
    await connection.workspace.applyEdit(insert);
    await connection.workspace.applyEdit(remove);
  } catch {
    // The editor may reject the edit; colors still refresh on the next request.
  }
}

function range(sl: number, sc: number, el: number, ec: number) {
  return { start: { line: sl, character: sc }, end: { line: el, character: ec } };
}

/** Resolve the workspace root as a filesystem path. */
function rootPath(params: InitializeParams): string {
  const folder = params.workspaceFolders?.[0]?.uri;
  const fromFolder = folder ? uriToPath(folder) : undefined;
  if (fromFolder) return fromFolder;
  const fromUri = params.rootUri ? uriToPath(params.rootUri) : undefined;
  return fromUri ?? params.rootPath ?? process.cwd();
}

/**
 * Zed forwards our workspace configuration nested under the server name (as in
 * `lsp.covhl.settings`); other clients may pass the object directly.
 */
function extractSettings(settings: unknown): unknown {
  if (settings && typeof settings === "object" && LSP_NAME in settings) {
    return (settings as Record<string, unknown>)[LSP_NAME];
  }
  return settings;
}

connection.listen();
