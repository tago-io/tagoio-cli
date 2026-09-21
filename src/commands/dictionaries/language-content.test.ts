import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

/**
 * Only `messages.js` is mocked, so the failure paths throw instead of exiting
 * the process. The filesystem is real: these helpers exist to guard against bad
 * files, and a mocked `fs` would not prove that.
 */
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

const { assembleContent, diffContent, parseSetPairs, readContentFile } = await import("./language-content.js");

const tempDir = mkdtempSync(join(tmpdir(), "dict-content-"));

function writeTemp(name: string, contents: string): string {
  const path = join(tempDir, name);
  writeFileSync(path, contents, "utf8");
  return path;
}

describe("readContentFile", () => {
  test("reads a flat string map", () => {
    const path = writeTemp("ok.json", '{"HELLO":"Ola","BYE":"Tchau"}');
    expect(readContentFile(path, {})).toEqual({ HELLO: "Ola", BYE: "Tchau" });
  });

  test("accepts an empty object", () => {
    const path = writeTemp("empty.json", "{}");
    expect(readContentFile(path, {})).toEqual({});
  });

  /**
   * `entity-create.ts` reads a user-supplied path with a bare `readFileSync`,
   * so a missing file escapes as an unhandled Node ENOENT with a stack trace
   * rather than a CLI error. This helper guards first.
   */
  test("a missing path fails with a CLI error naming the path, not an ENOENT stack", () => {
    const missing = join(tempDir, "does-not-exist.json");
    expect(() => readContentFile(missing, {})).toThrow(/file_not_found/);
    expect(() => readContentFile(missing, {})).toThrow(new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    expect(() => readContentFile(missing, {})).not.toThrow(/ENOENT/);
  });

  test("malformed JSON fails naming the file, not with a raw SyntaxError", () => {
    const path = writeTemp("broken.json", "{");
    expect(() => readContentFile(path, {})).toThrow(/invalid_json/);
    expect(() => readContentFile(path, {})).not.toThrow(/SyntaxError/);
  });

  test("an array is rejected", () => {
    const path = writeTemp("array.json", '["a","b"]');
    expect(() => readContentFile(path, {})).toThrow(/invalid_json/);
  });

  test("null is rejected", () => {
    const path = writeTemp("null.json", "null");
    expect(() => readContentFile(path, {})).toThrow(/invalid_json/);
  });

  test("a scalar is rejected", () => {
    const path = writeTemp("scalar.json", '"just a string"');
    expect(() => readContentFile(path, {})).toThrow(/invalid_json/);
  });

  /**
   * `LanguageData` is `Record<string, string>`. A number or nested object would
   * be rejected or coerced by the API, so it fails offline naming the key that
   * needs fixing — the file may hold hundreds of entries.
   */
  test("a numeric value fails naming the offending key", () => {
    const path = writeTemp("number.json", '{"OK":"fine","COUNT":42}');
    expect(() => readContentFile(path, {})).toThrow(/invalid_content/);
    expect(() => readContentFile(path, {})).toThrow(/COUNT/);
  });

  test("a nested object value fails naming the key", () => {
    const path = writeTemp("nested.json", '{"NESTED":{"a":"b"}}');
    expect(() => readContentFile(path, {})).toThrow(/NESTED/);
  });

  test("a null value fails naming the key", () => {
    const path = writeTemp("nullval.json", '{"EMPTY":null}');
    expect(() => readContentFile(path, {})).toThrow(/EMPTY/);
  });

  test("a boolean value fails naming the key", () => {
    const path = writeTemp("bool.json", '{"FLAG":true}');
    expect(() => readContentFile(path, {})).toThrow(/FLAG/);
  });
});

/**
 * The 7-character cap is absent from the SDK types and the docs. The API
 * reports it as "String must contain at most 7 character(s)" only after the
 * request, so it is verified offline instead.
 */
describe("assertSlugShape", () => {
  test("accepts a slug at the limit", async () => {
    const { assertSlugShape } = await import("./language-content.js");
    expect(assertSlugShape("PORTAL", "--slug", {})).toBe("PORTAL");
    expect(assertSlugShape("SEVENCH", "--slug", {})).toBe("SEVENCH");
  });

  test("rejects a slug over the limit, naming the length", async () => {
    const { assertSlugShape } = await import("./language-content.js");
    expect(() => assertSlugShape("TOOLONGSLUG", "--slug", {})).toThrow(/invalid_slug/);
    expect(() => assertSlugShape("TOOLONGSLUG", "--slug", {})).toThrow(/11/);
  });

  /**
   * The API also demands uppercase alphanumerics: "Invalid 'slug' format, it
   * must be a uppercase alphanumeric". Verified against a live profile —
   * lowercase, hyphens and spaces are all rejected, A-Z and 0-9 accepted.
   */
  test("accepts uppercase alphanumerics", async () => {
    const { assertSlugShape } = await import("./language-content.js");
    expect(assertSlugShape("CLI001", "--slug", {})).toBe("CLI001");
    expect(assertSlugShape("PORTAL", "--slug", {})).toBe("PORTAL");
    expect(assertSlugShape("A1", "--slug", {})).toBe("A1");
  });

  test.each([["cli001"], ["CLI-01"], ["CLI 01"], ["CLI_01"], ["CLI.01"], [""]])("rejects the malformed slug %s", async (slug) => {
    const { assertSlugShape } = await import("./language-content.js");
    expect(() => assertSlugShape(slug, "--slug", {})).toThrow(/invalid_slug/);
  });
});

/**
 * The API rejects a malformed key with "Invalid language 'key' should be an
 * uppercase alphanumeric field (type)". Probed against a live profile: `AB`,
 * `HELLO`, `KEY1` and `MY_KEY` are accepted; `A` (too short), `hello`, `Key`
 * and `MY-KEY` are not. So the rule is uppercase letters, digits and
 * underscores, at least two characters.
 */
describe("assertContentKeys", () => {
  test("accepts uppercase keys, digits and underscores", async () => {
    const { assertContentKeys } = await import("./language-content.js");
    expect(() => assertContentKeys({ AB: "x", HELLO: "y", KEY1: "z", MY_KEY: "w" }, {})).not.toThrow();
  });

  test.each([["A"], ["hello"], ["Key"], ["MY-KEY"], ["MY KEY"], [""]])("rejects the malformed key %s", async (key) => {
    const { assertContentKeys } = await import("./language-content.js");
    expect(() => assertContentKeys({ [key]: "value" }, {})).toThrow(/invalid_key/);
  });

  test("the failure names the offending key, since a file may hold hundreds", async () => {
    const { assertContentKeys } = await import("./language-content.js");
    expect(() => assertContentKeys({ GOOD: "x", "bad-key": "y" }, {})).toThrow(/bad-key/);
  });
});

describe("parseSetPairs", () => {
  test("splits each pair on the first = only", () => {
    expect(parseSetPairs(["GREETING=Hello=World"], {})).toEqual({ GREETING: "Hello=World" });
  });

  test("accumulates multiple pairs", () => {
    expect(parseSetPairs(["AA=1", "BB=2"], {})).toEqual({ AA: "1", BB: "2" });
  });

  test("accepts an empty value", () => {
    expect(parseSetPairs(["BLANK="], {})).toEqual({ BLANK: "" });
  });

  test("returns an empty object for no pairs", () => {
    expect(parseSetPairs([], {})).toEqual({});
    expect(parseSetPairs(undefined, {})).toEqual({});
  });

  test("rejects a pair with no =", () => {
    expect(() => parseSetPairs(["novalue"], {})).toThrow(/invalid_pair/);
  });

  test("rejects a pair with an empty key", () => {
    expect(() => parseSetPairs(["=orphan"], {})).toThrow(/invalid_pair/);
  });
});

describe("assembleContent", () => {
  test("uses the file alone", () => {
    const path = writeTemp("a.json", '{"AA":"1"}');
    expect(assembleContent({ file: path }, {})).toEqual({ AA: "1" });
  });

  test("uses the pairs alone", () => {
    expect(assembleContent({ set: ["AA=1"] }, {})).toEqual({ AA: "1" });
  });

  test("--set overrides a same-key entry from the file", () => {
    const path = writeTemp("merge.json", '{"AA":"from-file","BB":"keep"}');
    expect(assembleContent({ file: path, set: ["AA=from-flag"] }, {})).toEqual({ AA: "from-flag", BB: "keep" });
  });

  test("neither input fails", () => {
    expect(() => assembleContent({}, {})).toThrow(/missing_content/);
    expect(() => assembleContent({ set: [] }, {})).toThrow(/missing_content/);
  });
});

describe("diffContent", () => {
  test("counts additions against an empty target", () => {
    expect(diffContent({}, { AA: "1", BB: "2" })).toEqual({ added: 2, removed: 0, changed: 0 });
  });

  test("counts removals on a full replace", () => {
    expect(diffContent({ AA: "1", BB: "2", CC: "3" }, { AA: "1" })).toEqual({ added: 0, removed: 2, changed: 0 });
  });

  test("counts a changed value separately from an added key", () => {
    expect(diffContent({ AA: "1" }, { AA: "2", BB: "new" })).toEqual({ added: 1, removed: 0, changed: 1 });
  });

  test("an identical map reports no difference", () => {
    expect(diffContent({ AA: "1" }, { AA: "1" })).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  test("tolerates a null current, which the API may return for an empty locale", () => {
    expect(diffContent(null, { AA: "1" })).toEqual({ added: 1, removed: 0, changed: 0 });
  });
});
