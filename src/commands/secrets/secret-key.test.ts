import { describe, expect, test, vi } from "vitest";

/**
 * Only `messages.js` is mocked, so the failure paths throw instead of exiting.
 * Everything here is pure string handling.
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

const { normalizeSecretKey } = await import("./secret-key.js");

/**
 * Probed against a live profile, because nothing is discoverable from the SDK:
 * the type is a bare `string` and there is no client-side validation.
 *
 *   lowercase   -> accepted, stored as LOWERCASE  (the API uppercases)
 *   9LEADDIGIT  -> accepted
 *   _LEADUS     -> accepted
 *   PROBE-DASH  -> rejected
 *   PROBE DOT.X -> rejected
 *
 * So: uppercase letters, digits and underscores. Anything else is refused, and
 * the API's message for it is the unhelpful "Sorry, Internal Error".
 */
describe("normalizeSecretKey", () => {
  test("passes an already-uppercase key through", () => {
    expect(normalizeSecretKey("TWILIO_SID", {})).toBe("TWILIO_SID");
  });

  // The API uppercases silently, so doing it here keeps --json honest about
  // what was actually stored.
  test("uppercases a lowercase key, matching what the API stores", () => {
    expect(normalizeSecretKey("lowercase", {})).toBe("LOWERCASE");
    expect(normalizeSecretKey("MiXeD_case", {})).toBe("MIXED_CASE");
  });

  test("accepts a leading digit and a leading underscore", () => {
    expect(normalizeSecretKey("9LEADDIGIT", {})).toBe("9LEADDIGIT");
    expect(normalizeSecretKey("_LEADUS", {})).toBe("_LEADUS");
  });

  test.each([["PROBE-DASH"], ["PROBE DOT"], ["PROBE.X"], ["PROBE/X"], ["PROBE:X"], ["café"]])(
    "rejects %s, which the API refuses with an unhelpful error",
    (key) => {
      expect(() => normalizeSecretKey(key, {})).toThrow(/invalid_key/);
    },
  );

  test("the failure names the offending character", () => {
    expect(() => normalizeSecretKey("PROBE-DASH", {})).toThrow(/-/);
  });

  test("an empty key is rejected", () => {
    expect(() => normalizeSecretKey("", {})).toThrow(/invalid_key/);
  });

  test("routes through the JSON channel when --json is set", () => {
    expect(() => normalizeSecretKey("BAD-KEY", { json: true })).toThrow(/^json:invalid_key:/);
  });
});
