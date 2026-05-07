import { describe, expect, test } from "vitest";

import { cmdRepeatableValue } from "./commander-repeatable.js";

describe("cmdRepeatableValue (Commander accumulator for repeatable --option <value> flags)", () => {
  test("initializes a new array on the first call", () => {
    expect(cmdRepeatableValue("a", undefined as unknown as string)).toEqual(["a"]);
  });

  test("accumulates values when the previous value is already an array", () => {
    expect(cmdRepeatableValue("b", ["a"])).toEqual(["a", "b"]);
  });

  test("promotes a string previous (e.g. from a stray default) to a two-element array", () => {
    expect(cmdRepeatableValue("b", "a")).toEqual(["a", "b"]);
  });

  test("preserves duplicate values (commander does not dedupe)", () => {
    expect(cmdRepeatableValue("a", ["a"])).toEqual(["a", "a"]);
  });
});
