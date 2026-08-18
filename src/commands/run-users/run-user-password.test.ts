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

/** Recognisable string used to prove no code path prints the password. */
const SENTINEL = "SENTINEL_PASSWORD_12345";

describe("resolveRunUserPassword", () => {
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

  test("returns the password when both prompts match", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([SENTINEL, SENTINEL]);

    await expect(resolveRunUserPassword({})).resolves.toBe(SENTINEL);
  });

  /**
   * Masking is the whole reason this module exists rather than reusing
   * `requireOrFail`, which is hardcoded to `type: "text"` and would echo the
   * credential as it is typed.
   */
  test("asks with a password-typed prompt, so the input is masked", async () => {
    const { buildPasswordPrompt } = await import("./run-user-password.js");

    expect(buildPasswordPrompt("Password:")).toMatchObject({
      type: "password",
      name: "password",
      message: "Password:",
    });
  });

  /** The confirmation must be masked too, or the second entry defeats the first. */
  test("the confirmation prompt is password-typed as well", async () => {
    const { buildConfirmPrompt } = await import("./run-user-password.js");

    expect(buildConfirmPrompt()).toMatchObject({ type: "password", name: "confirm" });
  });

  test("passes a password through byte-for-byte", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    const awkward = 'a b=c "quoted" \\slash/ ç9';
    prompts.inject([awkward, awkward]);

    await expect(resolveRunUserPassword({})).resolves.toBe(awkward);
  });

  /**
   * A masked mistype is invisible by definition, and the user it locks out is
   * the one who cannot log in to report it.
   */
  test("a mismatched confirmation fails rather than creating an unusable login", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([SENTINEL, "SENTINEL_PASSWORD_54321"]);

    await expect(resolveRunUserPassword({})).rejects.toThrow(/password_mismatch/);
  });

  test("a mismatch never returns the first entry", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([SENTINEL, "different_one"]);

    await expect(resolveRunUserPassword({})).rejects.toThrow();

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  /**
   * The CLI's own floor, not the API's. The profile's Run user quota was full
   * during development, so what the API enforces could not be probed — the
   * message must not claim otherwise.
   */
  test("a password below the minimum is rejected offline", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject(["short12"]);

    await expect(resolveRunUserPassword({})).rejects.toThrow(/password_too_short/);
  });

  test("the rejection names the minimum", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject(["abc"]);

    await expect(resolveRunUserPassword({})).rejects.toThrow(/8/);
  });

  /** The message must not attribute the floor to the API, which was never probed. */
  test("the rejection does not claim the API requires it", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject(["abc"]);

    await expect(resolveRunUserPassword({})).rejects.not.toThrow(/API/i);
  });

  test("a password at the minimum is accepted", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject(["abcdefgh", "abcdefgh"]);

    await expect(resolveRunUserPassword({})).resolves.toBe("abcdefgh");
  });

  test("a too-short password fails before the confirmation is even asked", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject(["abc"]);

    // Only one value injected: reaching a second prompt would consume an empty
    // queue and resolve undefined, so `password_too_short` proves it stopped.
    await expect(resolveRunUserPassword({})).rejects.toThrow(/password_too_short/);
  });

  test("an empty answer fails rather than creating a passwordless user", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([""]);

    await expect(resolveRunUserPassword({})).rejects.toThrow(/empty_password/);
  });

  // prompts reports a cancelled prompt as an absent key, which reads as undefined.
  test("a cancelled prompt fails rather than creating a passwordless user", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([undefined]);

    await expect(resolveRunUserPassword({})).rejects.toThrow(/empty_password/);
  });

  /**
   * There is no flag carrying a password, so without a TTY there is no way to
   * supply one. The failure says so, rather than leaving the caller to guess.
   */
  test("--silent fails with an actionable message and never prompts", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    const promptSpy = vi.spyOn(prompts, "prompt");

    await expect(resolveRunUserPassword({ silent: true })).rejects.toThrow(/missing_input/);
    expect(promptSpy).not.toHaveBeenCalled();
  });

  test("--silent explains that the password must be typed", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");

    await expect(resolveRunUserPassword({ silent: true })).rejects.toThrow(/typed|interactiv/i);
  });

  test("--silent routes through the JSON channel when --json is set", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");

    await expect(resolveRunUserPassword({ silent: true, json: true })).rejects.toThrow(/^json:missing_input:/);
  });

  test("the password never reaches stdout or stderr on the success path", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([SENTINEL, SENTINEL]);

    await resolveRunUserPassword({});

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("the password never reaches either stream on the failure path", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([SENTINEL, ""]);

    await expect(resolveRunUserPassword({})).rejects.toThrow();

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("a custom message reaches the prompt", async () => {
    const { resolveRunUserPassword } = await import("./run-user-password.js");
    prompts.inject([SENTINEL, SENTINEL]);

    await expect(resolveRunUserPassword({}, "New password:")).resolves.toBe(SENTINEL);
  });
});
