import { describe, expect, test } from "vitest";

import { replaceObj } from "./replace-obj.js";

describe("replaceObj (string-level find/replace over a JSON-serializable object)", () => {
  test("replaces a single token across all string values", () => {
    const result = replaceObj({ name: "foo", label: "foo bar" }, { foo: "baz" });
    expect(result).toEqual({ name: "baz", label: "baz bar" });
  });

  test("applies multiple replacers in insertion order", () => {
    const result = replaceObj({ a: "hello world" }, { hello: "hi", world: "earth" });
    expect(result).toEqual({ a: "hi earth" });
  });

  test("replaces tokens inside nested objects and arrays (whole tree stringified)", () => {
    const input = { outer: { inner: "foo" }, list: ["foo", { nested: "foo" }] };
    const result = replaceObj(input, { foo: "bar" });
    expect(result).toEqual({ outer: { inner: "bar" }, list: ["bar", { nested: "bar" }] });
  });

  test("returns an equivalent object when no replacer keys are provided", () => {
    const input = { a: 1, b: "x" };
    expect(replaceObj(input, {})).toEqual(input);
  });

  test("treats replacer keys as regex patterns (caller responsibility to escape)", () => {
    // "f.o" is a regex — it matches "foo" and "fxo" both because `.` is any-char.
    // Documents the sharp edge: callers must escape user input.
    const result = replaceObj({ a: "foo", b: "fxo" }, { "f.o": "X" });
    expect(result).toEqual({ a: "X", b: "X" });
  });
});
