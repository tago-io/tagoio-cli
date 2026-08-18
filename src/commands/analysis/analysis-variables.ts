import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

interface VariableOptions {
  json?: boolean;
}

/**
 * The shape the API actually accepts.
 *
 * `AnalysisCreateInfo.variables` declares a single `{ key, value }` object with
 * `value: string | number | boolean`. Both halves of that are wrong, probed
 * against a live profile:
 *
 *   - an object is refused with `Expected array, received object`
 *   - a boolean value is refused with `Expected string, received boolean`
 *
 * So the payload is an array of string-valued pairs, and every call site casts
 * past the declared type.
 */
interface AnalysisVariable {
  key: string;
  value: string;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Parses repeatable `--var KEY=VALUE` flags into the array the API
 * expects.
 *
 * Splits on the **first** `=` only, so a value carrying its own `=` — a URL with
 * a query string, a base64 blob — survives intact.
 *
 * Returns `undefined` when no pairs were given, so the caller omits the
 * `variables` key entirely rather than sending an empty array, which would wipe
 * whatever the analysis already had.
 */
function parseAnalysisVariables(pairs: string[], options: VariableOptions): AnalysisVariable[] | undefined {
  if (!pairs.length) {
    return undefined;
  }

  return pairs.map((pair) => {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      failWith(`Invalid variable "${pair}": expected KEY=VALUE.`, "invalid_variable", options.json);
    }

    const key = pair.slice(0, separator).trim();
    if (!key) {
      failWith(`Invalid variable "${pair}": the key cannot be empty.`, "invalid_variable", options.json);
    }

    // The value is deliberately not trimmed: trailing whitespace can be
    // meaningful in a credential or a template string.
    return { key, value: pair.slice(separator + 1) };
  });
}

export { parseAnalysisVariables };
export type { AnalysisVariable, VariableOptions };
