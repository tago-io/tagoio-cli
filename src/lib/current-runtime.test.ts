import { describe, expect, test } from "vitest";

import { detectRuntime } from "./current-runtime.js";

describe("detectRuntime", () => {
  test("returns --deno when the SDK runtime string contains 'deno'", () => {
    expect(detectRuntime("deno-rt2025")).toBe("--deno");
  });

  test("returns --node for any non-deno runtime string", () => {
    expect(detectRuntime("node-rt2025")).toBe("--node");
  });

  test("returns --node when the runtime string is empty (default fallback)", () => {
    expect(detectRuntime("")).toBe("--node");
  });

  test("matches deno substring anywhere in the string (case-sensitive)", () => {
    expect(detectRuntime("custom-deno-flavor")).toBe("--deno");
    expect(detectRuntime("DENO")).toBe("--node");
  });
});
