import { existsSync, readFileSync } from "node:fs";

import type { SQLParam } from "@tago-io/sdk";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

interface PayloadOptions {
  query?: string;
  queryFile?: string;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Resolves the SQL text from `--query` or `--query-file`.
 *
 * The `existsSync` guard is deliberate: `entity-create.ts` reads a user-supplied
 * path with a bare `readFileSync`, so a wrong path escapes as an unhandled Node
 * ENOENT with a stack trace instead of a CLI error. `language-content.ts` guards
 * first, and this follows that.
 *
 * The SQL itself is **forwarded untouched**. The API is a real parser and its
 * rejections name the rule broken — `Only SELECT statements are allowed`, `All
 * tables must have an alias (use AS)`, `A query must reference at least one
 * table`. Duplicating any of that offline would go stale as the dialect grows.
 *
 * The one exception is an empty query: the API answers it with `Only a single
 * SQL statement is allowed`, which is true but reads as a parser complaint
 * rather than "you passed nothing".
 */
function resolveQuery(options: PayloadOptions): string | undefined {
  if (options.query !== undefined && options.queryFile !== undefined) {
    failWith("--query and --query-file cannot be used together.", "conflicting_flags", options.json);
  }

  let raw: string | undefined;

  if (options.query !== undefined) {
    raw = options.query;
  } else if (options.queryFile !== undefined) {
    if (!existsSync(options.queryFile)) {
      failWith(`File not found: ${options.queryFile}`, "file_not_found", options.json);
    }
    raw = readFileSync(options.queryFile, "utf8");
  }

  if (raw === undefined) {
    return undefined;
  }

  if (!raw.trim()) {
    failWith("The query is empty.", "empty_query", options.json);
  }

  return raw;
}

/**
 * @description Parses repeatable `--param $n=value` flags into the positional
 * shape the API expects.
 *
 * The `$` prefix is mandatory server-side — probed, `{ key: "1" }` fails with
 * `Invalid value for parameter 1`. Since `$1` needs quoting in most shells, a
 * caller who writes `--param 1=x` plainly meant `$1`, so a bare number is
 * normalised rather than refused. Anything else is a typo worth catching before
 * the round trip.
 *
 * Splits on the first `=` only, so a value carrying its own `=` — a URL, a LIKE
 * pattern — survives intact.
 *
 * Returns `undefined` when no pairs were given, so the caller omits the key and
 * the query's saved defaults apply. Probed: a query whose `$1` defaults to `%`
 * returned every row when executed with no params.
 */
function parseSQLParams(pairs: string[], options: PayloadOptions): SQLParam[] | undefined {
  if (!pairs.length) {
    return undefined;
  }

  return pairs.map((pair) => {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      failWith(`Invalid param "${pair}": expected $n=value.`, "invalid_param", options.json);
    }

    const rawKey = pair.slice(0, separator).trim();
    // Placeholders are 1-based, so `$0` is never valid.
    const match = /^\$?([1-9]\d*)$/.exec(rawKey);
    if (!match) {
      failWith(`Invalid param "${pair}": the key must be a positional placeholder such as $1.`, "invalid_param", options.json);
    }

    // The value is deliberately not trimmed: whitespace can be meaningful in a
    // LIKE pattern or a string comparison.
    return { key: `$${match[1]}`, value: pair.slice(separator + 1) };
  });
}

export { parseSQLParams, resolveQuery };
export type { PayloadOptions };
