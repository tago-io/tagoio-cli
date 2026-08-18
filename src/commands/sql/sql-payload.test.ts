import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});
const existsSyncMock = vi.fn(() => true);
const readFileSyncMock = vi.fn(() => "SELECT d.id FROM devices() AS d");

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

describe("sql payload", () => {
  beforeEach(() => {
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    existsSyncMock.mockReset().mockReturnValue(true);
    readFileSyncMock.mockReset().mockReturnValue("SELECT d.id FROM devices() AS d");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveQuery", () => {
    test("returns an inline query verbatim", async () => {
      const { resolveQuery } = await import("./sql-payload.js");

      expect(resolveQuery({ query: "SELECT d.id FROM devices() AS d" })).toBe("SELECT d.id FROM devices() AS d");
    });

    /** SQL is multi-line by nature, so newlines and indentation must survive. */
    test("preserves newlines and indentation", async () => {
      const { resolveQuery } = await import("./sql-payload.js");
      const multi = "SELECT\n  d.id,\n  d.name\nFROM devices() AS d";

      expect(resolveQuery({ query: multi })).toBe(multi);
    });

    test("reads a query from a file", async () => {
      const multi = "SELECT\n  d.id\nFROM devices() AS d";
      readFileSyncMock.mockReturnValue(multi);

      const { resolveQuery } = await import("./sql-payload.js");

      expect(resolveQuery({ queryFile: "q.sql" })).toBe(multi);
      expect(readFileSyncMock).toHaveBeenCalledWith("q.sql", "utf8");
    });

    /**
     * `entity-create.ts` reads a user path with a bare `readFileSync`, so a wrong
     * path escapes as an unhandled ENOENT with a stack trace.
     * `language-content.ts` guards with `existsSync` first; this follows that.
     */
    test("a missing file reports the path rather than an ENOENT stack trace", async () => {
      existsSyncMock.mockReturnValue(false);

      const { resolveQuery } = await import("./sql-payload.js");

      expect(() => resolveQuery({ queryFile: "nope.sql" })).toThrow(/file_not_found/);
      expect(() => resolveQuery({ queryFile: "nope.sql" })).toThrow(/nope\.sql/);
      expect(readFileSyncMock).not.toHaveBeenCalled();
    });

    test("the flag and its file twin together fail offline", async () => {
      const { resolveQuery } = await import("./sql-payload.js");

      expect(() => resolveQuery({ query: "SELECT 1", queryFile: "q.sql" })).toThrow(/conflicting_flags/);
    });

    /** The caller decides whether a query was required. */
    test("neither flag yields undefined", async () => {
      const { resolveQuery } = await import("./sql-payload.js");

      expect(resolveQuery({})).toBeUndefined();
    });

    /**
     * The API answers an empty query with `Only a single SQL statement is
     * allowed`, which is true but reads as a parser complaint rather than
     * "you passed nothing".
     */
    test("an empty query fails offline", async () => {
      const { resolveQuery } = await import("./sql-payload.js");

      expect(() => resolveQuery({ query: "" })).toThrow(/empty_query/);
    });

    test("a whitespace-only query fails offline", async () => {
      const { resolveQuery } = await import("./sql-payload.js");

      expect(() => resolveQuery({ query: "   \n  " })).toThrow(/empty_query/);
    });

    /**
     * The API is a SQL parser and its rejections name the rule broken — `Only
     * SELECT statements are allowed`, `All tables must have an alias (use AS)`.
     * Duplicating that offline would go stale, so the text is forwarded.
     */
    test("invalid SQL is forwarded, not rejected", async () => {
      const { resolveQuery } = await import("./sql-payload.js");

      expect(resolveQuery({ query: "INSERT INTO device VALUES (1)" })).toBe("INSERT INTO device VALUES (1)");
      expect(resolveQuery({ query: "SELECT FROM WHERE" })).toBe("SELECT FROM WHERE");
    });

    test("the rejection routes through the JSON channel when --json is set", async () => {
      const { resolveQuery } = await import("./sql-payload.js");

      expect(() => resolveQuery({ query: "", json: true })).toThrow(/^json:empty_query:/);
    });
  });

  describe("parseSQLParams", () => {
    test("parses a $n pair", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(parseSQLParams(["$1=abc"], {})).toEqual([{ key: "$1", value: "abc" }]);
    });

    test("keeps several pairs in the order given", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(parseSQLParams(["$1=a", "$2=b"], {})).toEqual([
        { key: "$1", value: "a" },
        { key: "$2", value: "b" },
      ]);
    });

    /**
     * Probed: the API rejects `{ key: "1" }` with `Invalid value for parameter
     * 1` — the `$` is mandatory. Since `$1` needs quoting in a shell, a caller
     * writing `--param 1=x` meant `$1`, so it is normalised rather than refused.
     */
    test("a bare number is normalised to $n", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(parseSQLParams(["1=abc"], {})).toEqual([{ key: "$1", value: "abc" }]);
    });

    test("a multi-digit placeholder works both ways", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(parseSQLParams(["$12=a", "13=b"], {})).toEqual([
        { key: "$12", value: "a" },
        { key: "$13", value: "b" },
      ]);
    });

    /** A value may itself contain `=`, so only the first one splits. */
    test("splits on the first = only", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(parseSQLParams(["$1=a=b&c=d"], {})).toEqual([{ key: "$1", value: "a=b&c=d" }]);
    });

    test("a non-positional key is rejected, naming the input", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(() => parseSQLParams(["foo=bar"], {})).toThrow(/invalid_param/);
      expect(() => parseSQLParams(["foo=bar"], {})).toThrow(/foo=bar/);
    });

    test("a pair with no = is rejected", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(() => parseSQLParams(["$1"], {})).toThrow(/invalid_param/);
    });

    test("$0 is rejected, since placeholders start at $1", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(() => parseSQLParams(["$0=a"], {})).toThrow(/invalid_param/);
    });

    /** Clearing one param's value is legitimate. */
    test("an empty value is accepted", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(parseSQLParams(["$1="], {})).toEqual([{ key: "$1", value: "" }]);
    });

    /** An absent flag must omit the key so the saved defaults apply. */
    test("no pairs yields undefined", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(parseSQLParams([], {})).toBeUndefined();
    });

    test("the rejection routes through the JSON channel when --json is set", async () => {
      const { parseSQLParams } = await import("./sql-payload.js");

      expect(() => parseSQLParams(["foo=bar"], { json: true })).toThrow(/^json:invalid_param:/);
    });
  });
});
