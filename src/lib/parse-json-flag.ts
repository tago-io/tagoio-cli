import { errorHandler, errorHandlerJSON } from "./messages.js";

interface ParseJSONFlagOptions {
  /** Route the failure through the JSON error channel. */
  json?: boolean;
  /** Error code to report. Defaults to `invalid_json`. */
  code?: string;
}

/** Shape the parsed value must have. Omit to accept any valid JSON. */
type JSONKind = "array" | "object";

/**
 * @description Parses a JSON-valued CLI flag, reporting the flag name rather
 * than a bare `SyntaxError`, and enforcing the shape the caller expects.
 *
 * Shared by the entity and dictionary commands, which previously carried
 * identical private copies of this logic. The `code` override exists so the
 * entity commands keep reporting `json_parse_failed`, the code their callers
 * and tests already depend on.
 */
function parseJSONFlag<T = unknown>(raw: string, flagName: string, kind: JSONKind | undefined, options: ParseJSONFlagOptions = {}): T {
  const code = options.code ?? "invalid_json";

  const fail = (message: string): never => {
    if (options.json) {
      errorHandlerJSON(message, code);
    }
    errorHandler(`${code}: ${message}`);
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Failed to parse ${flagName} JSON: ${detail}`);
  }

  const isArray = Array.isArray(parsed);
  // `typeof null === "object"`, so null must be excluded explicitly.
  const isObject = typeof parsed === "object" && parsed !== null && !isArray;

  if (kind === "array" && !isArray) {
    fail(`${flagName} must be a JSON array.`);
  }
  if (kind === "object" && !isObject) {
    fail(`${flagName} must be a JSON object.`);
  }

  return parsed as T;
}

export { parseJSONFlag };
export type { JSONKind, ParseJSONFlagOptions };
