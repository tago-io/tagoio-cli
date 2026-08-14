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
const requireOrFailMock = vi.fn(async (value: string | undefined, name: string, opts: { silent?: boolean; json?: boolean } = {}) => {
  if (value) {
    return value;
  }
  const message = `Missing required input: ${name}`;
  if (opts.json) {
    errorHandlerJSONMock(message, "missing_input");
  }
  errorHandlerMock(message);
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

/** Recognisable string used to prove no code path prints the value. */
const SENTINEL = "SENTINEL_VALUE_12345";

describe("secretCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    requireOrFailMock.mockClear();
    // Every create pre-checks for a duplicate key, so the listing needs a
    // default. Tests that care about the collision override it.
    resourcesInstance.secrets.list.mockResolvedValue([]);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("MY_KEY", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("sends the key and the typed value", async () => {
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("MY_KEY", { tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.secrets.create).toHaveBeenCalledWith({ key: "MY_KEY", value: SENTINEL });
  });

  test("--json reports the id from response.id", async () => {
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("MY_KEY", { tagkey: [], tagvalue: [], json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: "sec1", key: "MY_KEY" });
  });

  test("--json reports the length, the only observable proof the value landed", async () => {
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("MY_KEY", { tagkey: [], tagvalue: [], json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).value_length).toBe(SENTINEL.length);
  });

  /**
   * The API uppercases the key silently, so a lowercase one is stored under a
   * different name than the caller typed. Normalizing first keeps the reported
   * key equal to the stored one.
   */
  test("a lowercase key is normalized before it is sent", async () => {
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("lowercase_key", { tagkey: [], tagvalue: [], json: true } as never);

    expect(resourcesInstance.secrets.create.mock.calls[0][0].key).toBe("LOWERCASE_KEY");
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).key).toBe("LOWERCASE_KEY");
  });

  test("a key the API would refuse fails before any call, naming the character", async () => {
    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("BAD-KEY", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/invalid_key/);
    await expect(secretCreate("BAD-KEY", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/-/);

    expect(resourcesInstance.secrets.create).not.toHaveBeenCalled();
  });

  /**
   * The API answers a duplicate key with "Sorry, Internal Error" — the same
   * message it uses for a short value and for a full quota. Checking first is
   * what turns that into something the caller can act on, and is what
   * `restoreSecrets` already does for the same reason.
   */
  test("an existing key is reported before the value is even asked for", async () => {
    resourcesInstance.secrets.list.mockResolvedValue([{ id: "sec9", key: "TWILIO_SID" }]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("TWILIO_SID", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/key_exists/);

    expect(resourcesInstance.secrets.create).not.toHaveBeenCalled();
  });

  test("the duplicate message names the key", async () => {
    resourcesInstance.secrets.list.mockResolvedValue([{ id: "sec9", key: "TWILIO_SID" }]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("TWILIO_SID", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/TWILIO_SID/);
  });

  /**
   * The API reports a duplicate as "Sorry, Internal Error", which says nothing.
   * Stating the uniqueness rule is what tells the caller this is a conflict
   * rather than a transient failure worth retrying.
   */
  test("the duplicate message states the uniqueness rule", async () => {
    resourcesInstance.secrets.list.mockResolvedValue([{ id: "sec9", key: "TWILIO_SID" }]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("TWILIO_SID", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/unique/i);
  });

  // The check compares against the normalized key, since the API uppercases.
  test("a lowercase key still collides with its uppercase twin", async () => {
    resourcesInstance.secrets.list.mockResolvedValue([{ id: "sec9", key: "TWILIO_SID" }]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("twilio_sid", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/key_exists/);
  });

  /**
   * The pre-check must never block the real work: if listing fails, the create
   * still runs and the API stays the authority.
   */
  test("a failing pre-check does not block the create", async () => {
    resourcesInstance.secrets.list.mockRejectedValue(new Error("list down"));
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("NEW_KEY", { tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.secrets.create).toHaveBeenCalled();
  });

  test("tags reach the payload", async () => {
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("MY_KEY", { tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.secrets.create.mock.calls[0][0].tags).toEqual([{ key: "env", value: "prod" }]);
  });

  test("--silent fails before any API call, since the value can only be typed", async () => {
    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("MY_KEY", { tagkey: [], tagvalue: [], silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(resourcesInstance.secrets.create).not.toHaveBeenCalled();
  });

  test("an empty value fails before any API call", async () => {
    prompts.inject([""]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("MY_KEY", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/empty_value/);

    expect(resourcesInstance.secrets.create).not.toHaveBeenCalled();
  });

  /**
   * The rule the whole family exists to protect. The command holds the value in
   * memory, so nothing stops it printing one by accident — only a test does.
   */
  test("the value never reaches stdout or stderr in --json mode", async () => {
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("MY_KEY", { tagkey: [], tagvalue: [], json: true } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("the value never reaches either stream in human mode", async () => {
    resourcesInstance.secrets.create.mockResolvedValue({ id: "sec1" });
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await secretCreate("MY_KEY", { tagkey: [], tagvalue: [] } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  /**
   * The easiest place to leak: an error handler that echoes the request payload
   * to explain what failed.
   */
  test("a rejected create does not echo the value in its error", async () => {
    resourcesInstance.secrets.create.mockRejectedValue(new Error("boom"));
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("MY_KEY", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/create_failed|boom/);

    const reported = errorHandlerMock.mock.calls.map((call) => String(call[0])).join("");
    expect(reported).not.toContain(SENTINEL);
  });

  test("an API rejection reports create_failed", async () => {
    resourcesInstance.secrets.create.mockRejectedValue(new Error("boom"));
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("MY_KEY", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/create_failed|boom/);
  });

  test("an API rejection reports through the JSON channel when --json is set", async () => {
    resourcesInstance.secrets.create.mockRejectedValue(new Error("boom"));
    prompts.inject([SENTINEL]);

    const { secretCreate } = await import("./secret-create.js");
    await expect(secretCreate("MY_KEY", { tagkey: [], tagvalue: [], json: true } as never)).rejects.toThrow(/^json:create_failed:/);
  });
});
