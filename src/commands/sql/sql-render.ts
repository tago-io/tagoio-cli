import type { SQLExecuteResult } from "@tago-io/sdk";

import { writeStatus } from "../../lib/messages.js";

/**
 * Formats one cell for display.
 *
 * `null` and `undefined` become an empty string rather than the words "null" or
 * "undefined", which read as data. An object becomes compact JSON rather than
 * `[object Object]`, which is what string coercion would produce for a `json`
 * column.
 *
 * Deliberately does **not** switch on the column's declared type: `SQLColumn`
 * lists five, and the API also returns `integer` — probed. A renderer keyed on
 * the type would break on the next one added.
 */
function formatCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

/**
 * @description Projects each row into the column order the query declared.
 *
 * This exists because `console.table` sorts keys alphabetically. Probed against
 * the real aggregate query, it turned
 *
 *   period_start, period_end, temperature_avg_f, temperature_min_f, temperature_max_f
 *
 * into
 *
 *   period_end, period_start, temperature_avg_f, temperature_max_f, temperature_min_f
 *
 * For every other resource in this CLI an arbitrary key order is cosmetic. For a
 * SQL result it is wrong: `SELECT a, b, c` has to render as `a, b, c`, and a
 * reader comparing min against max in the wrong slots misreads the number.
 *
 * The API returns `columns` in query order and row keys match it exactly, so the
 * projection is a reorder rather than a guess. A key the query did not select is
 * dropped; a column with no value in the row renders empty.
 */
function projectRows(result: SQLExecuteResult): Record<string, string | number | boolean>[] {
  const names = result.columns.map((column) => column.name);

  return result.rows.map((row) => {
    const projected: Record<string, string | number | boolean> = {};
    for (const name of names) {
      projected[name] = formatCell(row[name]);
    }
    return projected;
  });
}

/**
 * @description Prints the rows, in query order, and returns what a zero-row
 * result reported so the caller can assert on it.
 *
 * Zero rows is a valid answer rather than a failure, so the column names are
 * printed instead — that keeps "no matches" distinguishable from "the query
 * broke", which an empty screen would not.
 */
function renderRows(result: SQLExecuteResult): string {
  if (result.row_count === 0 || result.rows.length === 0) {
    const names = result.columns.map((column) => column.name).join(", ");
    const message = `No rows. Columns: ${names || "(none)"}`;
    writeStatus(message);
    return message;
  }

  console.table(projectRows(result));
  return "";
}

/**
 * @description Builds the status line that follows a result.
 *
 * Goes to stderr, because the rows are the data and this is the metadata about
 * fetching them — the sharpest instance of that split in the CLI.
 */
function buildFooter(result: SQLExecuteResult): string {
  const rows = `${result.row_count} row${result.row_count === 1 ? "" : "s"}`;
  const origin = result.served_from_cache ? "served from cache" : "not cached";
  return `${rows} in ${result.execution_ms}ms (${origin}).`;
}

export { buildFooter, formatCell, projectRows, renderRows };
