import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});
/**
 * Mirrors the real `requireOrFail`, including that it *prompts* when the value
 * is absent. A mock that skipped the prompt would leave `prompts.inject`
 * entries unconsumed and shift every later answer onto the wrong question.
 */
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string, opts: { silent?: boolean; json?: boolean } = {}) => {
  if (value) {
    return value;
  }
  if (opts.silent) {
    const message = `Missing required input: ${name}`;
    if (opts.json) {
      errorHandlerJSONMock(message, "missing_input");
    }
    errorHandlerMock(message);
  }
  const { input } = await prompts({ type: "text", name: "input", message: `Enter ${name}:` });
  if (!input) {
    errorHandlerMock(`Missing required input: ${name}`);
  }
  return input as string;
});

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
  requireOrFail: requireOrFailMock,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

/** Recognisable string used to prove no code path prints the password. */
const SENTINEL = "SENTINEL_PASSWORD_12345";

describe("runUserCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    // Every create pre-checks the email, so the listing needs a default.
    resourcesInstance.run.listUsers.mockResolvedValue([]);
    resourcesInstance.run.userCreate.mockResolvedValue({ user: "usr1" });
    resourcesInstance.account.info.mockResolvedValue({ timezone: "America/Sao_Paulo" });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("a@b.com", { name: "A", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("sends the email, name and typed password", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0]).toMatchObject({
      email: "new@tago.io",
      name: "New User",
      password: SENTINEL,
    });
  });

  /**
   * `userCreate` resolves `{ user }` — the fourth distinct id key in this
   * codebase, after devices' `{ device_id }`, actions' `{ action }` and
   * dictionaries' `{ dictionary }`.
   */
  test("--json reports the id read from response.user", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", json: true, tagkey: [], tagvalue: [] } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({
      id: "usr1",
      email: "new@tago.io",
      name: "New User",
      active: true,
    });
  });

  test("--json never carries the password", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", json: true, tagkey: [], tagvalue: [] } as never);

    expect(String(stdoutSpy.mock.calls[0][0])).not.toContain("password");
  });

  /**
   * The API reports a duplicate email opaquely, and the quota makes a wasted
   * create expensive. Checking first also avoids prompting for a credential
   * that is about to be discarded — same shape as `secret-create`.
   */
  test("an existing email is reported before the password is even asked for", async () => {
    resourcesInstance.run.listUsers.mockResolvedValue([{ id: "usr9", email: "taken@tago.io" }]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("taken@tago.io", { name: "A", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/email_exists/);

    expect(resourcesInstance.run.userCreate).not.toHaveBeenCalled();
  });

  test("the duplicate message names the email", async () => {
    resourcesInstance.run.listUsers.mockResolvedValue([{ id: "usr9", email: "taken@tago.io" }]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("taken@tago.io", { name: "A", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/taken@tago\.io/);
  });

  // The API treats the email as identity; case is not part of it.
  test("the duplicate check is case-insensitive", async () => {
    resourcesInstance.run.listUsers.mockResolvedValue([{ id: "usr9", email: "taken@tago.io" }]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("Taken@Tago.IO", { name: "A", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/email_exists/);
  });

  /**
   * The pre-check must never block the real work: if listing fails, the create
   * still runs and the API stays the authority.
   */
  test("a failing pre-check does not block the create", async () => {
    resourcesInstance.run.listUsers.mockRejectedValue(new Error("list down"));
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userCreate).toHaveBeenCalled();
  });

  test("a malformed email fails before any API call", async () => {
    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("not-an-email", { name: "A", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_email/);

    expect(resourcesInstance.run.listUsers).not.toHaveBeenCalled();
    expect(resourcesInstance.run.userCreate).not.toHaveBeenCalled();
  });

  /**
   * The API requires `timezone`, and no profile-level field carries one —
   * probed `profiles.info` and `run.info`, neither has it. `account.info` does,
   * and works with the profile token these commands already hold.
   */
  test("timezone defaults to the account's timezone", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0].timezone).toBe("America/Sao_Paulo");
  });

  // The lookup costs ~800ms, so it must not run when the answer is already known.
  test("--timezone overrides the default without calling account.info", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", timezone: "UTC", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0].timezone).toBe("UTC");
    expect(resourcesInstance.account.info).not.toHaveBeenCalled();
  });

  test("a doomed create does not pay for the timezone lookup", async () => {
    resourcesInstance.run.listUsers.mockResolvedValue([{ id: "usr9", email: "taken@tago.io" }]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("taken@tago.io", { name: "A", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/email_exists/);

    expect(resourcesInstance.account.info).not.toHaveBeenCalled();
  });

  /**
   * The field is typed `string` and was populated when probed, but nothing
   * guarantees it on every account — and the API requires it.
   */
  // The timezone is resolved before the password, so it is answered first.
  test("an empty account timezone falls back to a prompt", async () => {
    resourcesInstance.account.info.mockResolvedValue({ timezone: "" });
    prompts.inject(["Europe/Lisbon", SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0].timezone).toBe("Europe/Lisbon");
  });

  test("a failing account.info falls back to a prompt rather than sending nothing", async () => {
    resourcesInstance.account.info.mockRejectedValue(new Error("account down"));
    prompts.inject(["Europe/Lisbon", SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0].timezone).toBe("Europe/Lisbon");
  });

  test("tags reach the payload", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", tagkey: ["access"], tagvalue: ["admin"] } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0].tags).toEqual([{ key: "access", value: "admin" }]);
  });

  test("--inactive creates a deactivated user", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", inactive: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0].active).toBe(false);
  });

  test("optional fields pass through when given", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", {
      name: "New User",
      company: "Tago",
      phone: "+5511999999999",
      language: "pt",
      tagkey: [],
      tagvalue: [],
    } as never);

    expect(resourcesInstance.run.userCreate.mock.calls[0][0]).toMatchObject({
      company: "Tago",
      phone: "+5511999999999",
      language: "pt",
    });
  });

  test("--silent fails before any API call, since the password can only be typed", async () => {
    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("new@tago.io", { name: "New User", silent: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/missing_input/);

    expect(resourcesInstance.run.userCreate).not.toHaveBeenCalled();
  });

  test("a mismatched password confirmation aborts with no API call", async () => {
    prompts.inject([SENTINEL, "something_else_12"]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/password_mismatch/);

    expect(resourcesInstance.run.userCreate).not.toHaveBeenCalled();
  });

  /**
   * The rule the family exists to protect. The command holds the password in
   * memory, so nothing but a test stops it printing one by accident.
   */
  test("the password never reaches stdout or stderr in --json mode", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", json: true, tagkey: [], tagvalue: [] } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("the password never reaches either stream in human mode", async () => {
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  /**
   * The easiest place to leak: an error handler that echoes the request payload
   * to explain what failed.
   */
  test("a rejected create does not echo the password in its error", async () => {
    resourcesInstance.run.userCreate.mockRejectedValue(new Error("boom"));
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/create_failed|boom/);

    const reported = errorHandlerMock.mock.calls.map((call) => String(call[0])).join("");
    expect(reported).not.toContain(SENTINEL);
  });

  /** The quota message already names the limit, so it passes through intact. */
  test("a quota rejection surfaces the API's own message", async () => {
    resourcesInstance.run.userCreate.mockRejectedValue(new Error("You have exceeded the maximum limit of Run users (2)"));
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("new@tago.io", { name: "New User", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/maximum limit of Run users \(2\)/);
  });

  test("an API rejection routes through the JSON channel when --json is set", async () => {
    resourcesInstance.run.userCreate.mockRejectedValue(new Error("boom"));
    prompts.inject([SENTINEL, SENTINEL]);

    const { runUserCreate } = await import("./run-user-create.js");
    await expect(runUserCreate("new@tago.io", { name: "New User", json: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/^json:create_failed:/);
  });
});
