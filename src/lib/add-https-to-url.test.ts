import { describe, expect, test } from "vitest";

import { addHttpsToUrl } from "./add-https-to-url.js";

describe("addHttpsToUrl", () => {
  test("prepends https:// when the url is bare", () => {
    expect(addHttpsToUrl("api.tago.io")).toBe("https://api.tago.io");
  });

  test("returns an already-https url unchanged", () => {
    expect(addHttpsToUrl("https://api.tago.io")).toBe("https://api.tago.io");
  });

  test("returns an empty string when the url is empty (guards against null-ish input)", () => {
    expect(addHttpsToUrl("")).toBe("");
  });

  test("double-prefixes http:// urls (documents latent bug — current check only looks for https://)", () => {
    // Known bug: the guard is `startsWith("https://")`, so an `http://` prefix slips through and
    // gets a second `https://` bolted on. Not fixing here (scope: T5.2 is testing, not bug-fix);
    // this assertion will fail loudly if the implementation is ever corrected, signaling the fix.
    expect(addHttpsToUrl("http://api.tago.io")).toBe("https://http://api.tago.io");
  });
});
