import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Only `messages.js` is mocked, so the failure paths throw instead of exiting
 * the process. `prompts` stays real and is driven through `prompts.inject`,
 * because the point of this module is which prompt type it asks for.
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

/** Recognisable string used to prove no code path prints the value. */
const SENTINEL = "SENTINEL_VALUE_12345";

describe("resolveSecretValue", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns the value typed at the prompt", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject([SENTINEL]);

    await expect(resolveSecretValue({})).resolves.toBe(SENTINEL);
  });

  /**
   * Masking is the whole reason this module exists rather than reusing
   * `requireOrFail`, which is hardcoded to `type: "text"` and would echo the
   * credential as it is typed.
   */
  test("asks with a password-typed prompt, so the input is masked", async () => {
    const { buildValuePrompt } = await import("./secret-value.js");

    expect(buildValuePrompt("Secret value:")).toMatchObject({
      type: "password",
      name: "value",
      message: "Secret value:",
    });
  });

  test("passes a value through byte-for-byte", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    const awkward = 'a b=c "quoted" \\slash/ ç';
    prompts.inject([awkward]);

    await expect(resolveSecretValue({})).resolves.toBe(awkward);
  });

  /**
   * The API refuses a value shorter than 6 characters, and says only "Sorry,
   * Internal Error" — the same message it uses for a duplicate key and for a
   * full quota. Probed against a live profile: 5 rejected, 6 accepted.
   */
  test("a value shorter than the API minimum is rejected offline", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject(["short"]);

    await expect(resolveSecretValue({})).rejects.toThrow(/value_too_short/);
  });

  test("the rejection names the minimum", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject(["abc"]);

    await expect(resolveSecretValue({})).rejects.toThrow(/6/);
  });

  test("a value at the minimum is accepted", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject(["abcdef"]);

    await expect(resolveSecretValue({})).resolves.toBe("abcdef");
  });

  test("an empty answer fails rather than storing an empty secret", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject([""]);

    await expect(resolveSecretValue({})).rejects.toThrow(/empty_value/);
  });

  // prompts reports a cancelled prompt as an absent key, which reads as undefined.
  test("a cancelled prompt fails rather than storing an empty secret", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject([undefined]);

    await expect(resolveSecretValue({})).rejects.toThrow(/empty_value/);
  });

  /**
   * There is no flag carrying a value, so without a TTY there is no way to
   * supply one. The failure says so, rather than leaving the caller to guess.
   */
  test("--silent fails with an actionable message and never prompts", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    const promptSpy = vi.spyOn(prompts, "prompt");

    await expect(resolveSecretValue({ silent: true })).rejects.toThrow(/missing_input/);
    expect(promptSpy).not.toHaveBeenCalled();
  });

  test("--silent explains that the value must be typed", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");

    await expect(resolveSecretValue({ silent: true })).rejects.toThrow(/typed|interactiv/i);
  });

  test("--silent routes through the JSON channel when --json is set", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");

    await expect(resolveSecretValue({ silent: true, json: true })).rejects.toThrow(/^json:missing_input:/);
  });

  test("the value never reaches stdout or stderr on the success path", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject([SENTINEL]);

    await resolveSecretValue({});

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("the value never reaches either stream on the failure path", async () => {
    const { resolveSecretValue } = await import("./secret-value.js");
    prompts.inject([""]);

    await expect(resolveSecretValue({})).rejects.toThrow();

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });
});
