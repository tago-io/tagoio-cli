import { describe, expect, test } from "vitest";

import { compare } from "./compare.js";

describe("compare (semver-like 3-part version compare)", () => {
  test("returns 0 for equal versions", () => {
    expect(compare("1.2.3", "1.2.3")).toBe(0);
  });

  test("returns 1 when the first version is newer (major bump)", () => {
    expect(compare("2.0.0", "1.9.9")).toBe(1);
  });

  test("returns -1 when the first version is older (minor bump)", () => {
    expect(compare("1.1.0", "1.2.0")).toBe(-1);
  });

  test("returns 1 for patch bump in favor of first", () => {
    expect(compare("1.2.4", "1.2.3")).toBe(1);
  });

  test("treats missing patch as NaN — stable prefix wins over shorter one", () => {
    // "1.2" has NaN in the patch slot; "1.2.0" has 0 → 0 > NaN → second version wins
    expect(compare("1.2", "1.2.0")).toBe(-1);
  });

  test("handles zero-padded numerics correctly (no string comparison)", () => {
    expect(compare("1.10.0", "1.2.0")).toBe(1);
  });
});
