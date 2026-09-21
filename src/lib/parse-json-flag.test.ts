import { describe, expect, test, vi } from "vitest";

/**
 * The helper signals failure through `errorHandler` / `errorHandlerJSON`, which
 * call `process.exit(1)`. Mocking `messages.js` so they throw instead is what
 * makes the failure paths assertable. Nothing else is mocked.
 */
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});

vi.mock("./messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
}));

const { parseJSONFlag } = await import("./parse-json-flag.js");

describe("parseJSONFlag", () => {
  test("parses any valid JSON when no kind is required", () => {
    expect(parseJSONFlag('{"a":1}', "--flag", undefined, {})).toEqual({ a: 1 });
    expect(parseJSONFlag("[1,2]", "--flag", undefined, {})).toEqual([1, 2]);
    expect(parseJSONFlag('"text"', "--flag", undefined, {})).toBe("text");
  });

  test("parses an array for an array-kind flag", () => {
    expect(parseJSONFlag('[{"a":1}]', "--trigger-json", "array", {})).toEqual([{ a: 1 }]);
  });

  test("parses an object for an object-kind flag", () => {
    expect(parseJSONFlag('{"type":"script"}', "--action-json", "object", {})).toEqual({ type: "script" });
  });

  test("names the offending flag instead of surfacing a raw SyntaxError", () => {
    expect(() => parseJSONFlag("{", "--trigger-json", "array", {})).toThrow(/--trigger-json/);
    expect(() => parseJSONFlag("{", "--trigger-json", "array", {})).not.toThrow(/SyntaxError/);
  });

  test("rejects an object where an array is required", () => {
    expect(() => parseJSONFlag('{"a":1}', "--trigger-json", "array", {})).toThrow(/invalid_json/);
  });

  test("rejects an array where an object is required", () => {
    expect(() => parseJSONFlag("[1,2]", "--action-json", "object", {})).toThrow(/invalid_json/);
  });

  // typeof null === "object", so a naive check lets null through.
  test("rejects null for an object-kind flag", () => {
    expect(() => parseJSONFlag("null", "--action-json", "object", {})).toThrow(/invalid_json/);
  });

  test("rejects a scalar for an object-kind flag", () => {
    expect(() => parseJSONFlag("42", "--action-json", "object", {})).toThrow(/invalid_json/);
  });

  test("routes through the JSON error channel when json is set", () => {
    errorHandlerJSONMock.mockClear();
    expect(() => parseJSONFlag("{", "--flag", "object", { json: true })).toThrow(/^json:invalid_json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.any(String), "invalid_json");
  });

  /**
   * The entity commands report a malformed payload as `json_parse_failed`.
   * Their call sites keep that code through the `code` override so migrating
   * them to this helper does not change the contract their tests assert.
   */
  test("honours a caller-supplied error code", () => {
    errorHandlerJSONMock.mockClear();
    expect(() => parseJSONFlag("{", "--data", undefined, { json: true, code: "json_parse_failed" })).toThrow(/^json:json_parse_failed:/);
  });
});
