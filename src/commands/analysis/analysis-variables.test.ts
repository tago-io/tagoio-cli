import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
}));

describe("parseAnalysisVariables", () => {
  beforeEach(() => {
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * `AnalysisCreateInfo.variables` declares a single `{ key, value }` object,
   * but the API rejects that with `Expected array, received object` — probed
   * against a live profile. The array is what actually round-trips.
   */
  test("builds an array, which is what the API accepts", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(parseAnalysisVariables(["A=1"], {})).toEqual([{ key: "A", value: "1" }]);
  });

  test("keeps several pairs in the order given", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(parseAnalysisVariables(["A=1", "B=2"], {})).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
  });

  /** A URL with a query string is the case a naive split on every `=` breaks. */
  test("splits on the first = only, so a URL value survives", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(parseAnalysisVariables(["URL=https://x.com/?a=b&c=d"], {})).toEqual([{ key: "URL", value: "https://x.com/?a=b&c=d" }]);
  });

  /**
   * The type allows `string | number | boolean`, but the API refuses anything
   * else: `Expected string, received boolean`. A CLI flag cannot express a real
   * boolean anyway, so the string is both correct and the only option.
   */
  test("a boolean-looking value stays a string", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    const parsed = parseAnalysisVariables(["DEBUG=true"], {});
    expect(parsed?.[0].value).toBe("true");
    expect(typeof parsed?.[0].value).toBe("string");
  });

  test("a number-looking value stays a string", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    const parsed = parseAnalysisVariables(["RETRIES=3"], {});
    expect(parsed?.[0].value).toBe("3");
    expect(typeof parsed?.[0].value).toBe("string");
  });

  /** Clearing one variable's value is legitimate, so an empty value is allowed. */
  test("an empty value is accepted", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(parseAnalysisVariables(["KEY="], {})).toEqual([{ key: "KEY", value: "" }]);
  });

  test("surrounding whitespace is trimmed from the key", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(parseAnalysisVariables([" A =1"], {})).toEqual([{ key: "A", value: "1" }]);
  });

  test("a pair with no = is rejected, naming the offending input", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(() => parseAnalysisVariables(["NOEQUALS"], {})).toThrow(/invalid_variable/);
    expect(() => parseAnalysisVariables(["NOEQUALS"], {})).toThrow(/NOEQUALS/);
  });

  test("an empty key is rejected", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(() => parseAnalysisVariables(["=value"], {})).toThrow(/invalid_variable/);
  });

  test("the rejection routes through the JSON channel when --json is set", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(() => parseAnalysisVariables(["NOEQUALS"], { json: true })).toThrow(/^json:invalid_variable:/);
  });

  /**
   * An absent flag must omit the key from the payload entirely rather than
   * sending an empty array, which would wipe the existing variables.
   */
  test("no pairs yields undefined, so the payload omits the key", async () => {
    const { parseAnalysisVariables } = await import("./analysis-variables.js");

    expect(parseAnalysisVariables([], {})).toBeUndefined();
  });
});
