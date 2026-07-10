/** `file://` URI to filesystem path conversion. */

import { fileURLToPath } from "node:url";

export function uriToPath(uri: string): string | undefined {
  if (!uri.startsWith("file://")) return undefined;
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}
