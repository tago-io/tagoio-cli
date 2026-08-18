import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Deliberately built so query order and alphabetical order disagree: sorted
 * alphabetically this becomes period_end, period_start, temperature_max_f,
 * temperature_min_f. That is exactly what `console.table` does to it, and why
 * this module exists.
 */
const RESULT = {
  columns: [
    { name: "period_start", type: "timestamp" },
    { name: "period_end", type: "timestamp" },
    { name: "temperature_min_f", type: "number" },
    { name: "temperature_max_f", type: "number" },
    // Probed: the API returns `integer`, which SQLColumn does not declare.
    { name: "readings_count", type: "integer" },
  ],
  rows: [
    {
      period_start: "2026-07-06T00:00:13.929+00:00",
      period_end: "2026-08-05T23:55:45.334+00:00",
      temperature_min_f: 5,
      temperature_max_f: 11,
      readings_count: 21257,
    },
  ],
  row_count: 1,
  execution_ms: 383,
  served_from_cache: false,
};

describe("sql render", () => {
  let tableSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("projectRows", () => {
    /**
     * The headline assertion. `console.table` sorts keys alphabetically, which
     * on this fixture puts period_end before period_start and swaps min with
     * max. For a result set that is a correctness bug: someone comparing the
     * two temperatures would read the wrong pair.
     */
    test("keeps columns in query order, not alphabetical", async () => {
      const { projectRows } = await import("./sql-render.js");

      const projected = projectRows(RESULT as never);
      expect(Object.keys(projected[0])).toEqual(["period_start", "period_end", "temperature_min_f", "temperature_max_f", "readings_count"]);
    });

    /** Guards the assertion above from being weakened into a set comparison. */
    test("the first column is the one the query selected first", async () => {
      const { projectRows } = await import("./sql-render.js");

      expect(Object.keys(projectRows(RESULT as never)[0])[0]).toBe("period_start");
    });

    test("values survive the projection unchanged", async () => {
      const { projectRows } = await import("./sql-render.js");

      const row = projectRows(RESULT as never)[0];
      expect(row.temperature_min_f).toBe(5);
      expect(row.readings_count).toBe(21257);
    });

    test("a column missing from a row renders empty rather than undefined", async () => {
      const { projectRows } = await import("./sql-render.js");
      const sparse = { ...RESULT, rows: [{ period_start: "x" }] };

      const row = projectRows(sparse as never)[0];
      expect(row.period_end).toBe("");
    });

    /** A key the query did not select has no column to belong to. */
    test("a row key absent from columns is dropped", async () => {
      const { projectRows } = await import("./sql-render.js");
      const extra = { ...RESULT, rows: [{ ...RESULT.rows[0], sneaky: "value" }] };

      expect(Object.keys(projectRows(extra as never)[0])).not.toContain("sneaky");
    });

    test("null renders empty rather than the string null", async () => {
      const { projectRows } = await import("./sql-render.js");
      const withNull = { ...RESULT, rows: [{ ...RESULT.rows[0], temperature_min_f: null }] };

      expect(projectRows(withNull as never)[0].temperature_min_f).toBe("");
    });

    test("a nested value renders as compact JSON, not [object Object]", async () => {
      const { projectRows } = await import("./sql-render.js");
      const nested = { ...RESULT, rows: [{ ...RESULT.rows[0], period_start: { a: 1 } }] };

      expect(projectRows(nested as never)[0].period_start).toBe('{"a":1}');
    });

    /** An undeclared column type must not be special-cased anywhere. */
    test("an unknown column type renders like any other", async () => {
      const { projectRows } = await import("./sql-render.js");

      expect(projectRows(RESULT as never)[0].readings_count).toBe(21257);
    });

    test("zero rows projects to an empty array", async () => {
      const { projectRows } = await import("./sql-render.js");
      const empty = { ...RESULT, rows: [], row_count: 0 };

      expect(projectRows(empty as never)).toEqual([]);
    });
  });

  describe("renderRows", () => {
    test("prints the projected rows through console.table", async () => {
      const { renderRows } = await import("./sql-render.js");
      await renderRows(RESULT as never);

      expect(tableSpy).toHaveBeenCalled();
      expect(Object.keys((tableSpy.mock.calls[0][0] as Record<string, unknown>[])[0])[0]).toBe("period_start");
    });

    /**
     * Zero rows is a valid answer, not a failure. Printing the column names
     * keeps the distinction between "no matches" and "query broke" visible.
     */
    test("zero rows still names the columns", async () => {
      const { renderRows } = await import("./sql-render.js");
      const empty = { ...RESULT, rows: [], row_count: 0 };

      const written = await renderRows(empty as never);
      expect(written).toMatch(/period_start/);
    });
  });

  describe("buildFooter", () => {
    test("names the row count, the duration and the cache state", async () => {
      const { buildFooter } = await import("./sql-render.js");
      const footer = buildFooter(RESULT as never);

      expect(footer).toMatch(/1 row\b/);
      expect(footer).toMatch(/383/);
      expect(footer).toMatch(/cache/i);
    });

    test("pluralises the row count", async () => {
      const { buildFooter } = await import("./sql-render.js");

      expect(buildFooter({ ...RESULT, row_count: 2 } as never)).toMatch(/2 rows\b/);
      expect(buildFooter({ ...RESULT, row_count: 0 } as never)).toMatch(/0 rows\b/);
    });

    test("a cached result reads differently from a fresh one", async () => {
      const { buildFooter } = await import("./sql-render.js");

      const fresh = buildFooter(RESULT as never);
      const cached = buildFooter({ ...RESULT, served_from_cache: true } as never);
      expect(fresh).not.toBe(cached);
      expect(cached).toMatch(/from cache/i);
    });
  });
});
