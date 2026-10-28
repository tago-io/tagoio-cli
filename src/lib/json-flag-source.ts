import { existsSync, readFileSync } from "node:fs";

import { errorHandler, errorHandlerJSON } from "./messages.js";

interface JSONFlagSourceOptions {
  json?: boolean;
}

interface JSONFlagSource {
  raw: string;
  /** What to name in a parse error: the flag, or the file path it came from. */
  label: string;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Resolves a JSON flag that may arrive inline (`--flag '<json>'`)
 * or from a file (`--flag-file path`). Returns `undefined` when neither was
 * given.
 *
 * The `existsSync` guard is deliberate: a bare `readFileSync` on a wrong path
 * escapes as an unhandled Node ENOENT with a stack trace instead of a CLI
 * error.
 */
function readJSONFlagSource(inline: string | undefined, file: string | undefined, flag: string, options: JSONFlagSourceOptions): JSONFlagSource | undefined {
  if (inline !== undefined && file !== undefined) {
    failWith(`${flag} and ${flag}-file cannot be used together.`, "conflicting_flags", options.json);
  }

  if (inline !== undefined) {
    return { raw: inline, label: flag };
  }

  if (file === undefined) {
    return undefined;
  }

  if (!existsSync(file)) {
    failWith(`File not found: ${file}`, "file_not_found", options.json);
  }

  return { raw: readFileSync(file, "utf8"), label: file };
}

export { readJSONFlagSource };
export type { JSONFlagSource, JSONFlagSourceOptions };
