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
const pickSecretIDMock = vi.fn();

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
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-secret-id-from-tagoio.js", () => ({
  pickSecretIDFromTagoIO: pickSecretIDMock,
}));

const SENTINEL = "SENTINEL_VALUE_12345";

describe("secretEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickSecretIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { secretEdit } = await import("./secret-edit.js");
    await expect(secretEdit("sec1", { rotate: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/Environment not found/);
  });

  test("an empty patch is rejected without touching the API", async () => {
    const { secretEdit } = await import("./secret-edit.js");
    await expect(secretEdit("sec1", { tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.secrets.edit).not.toHaveBeenCalled();
  });

  test("--rotate prompts and sends only the value", async () => {
    resourcesInstance.secrets.edit.mockResolvedValue("Successfully Updated");
    prompts.inject([SENTINEL]);

    const { secretEdit } = await import("./secret-edit.js");
    await secretEdit("sec1", { rotate: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.secrets.edit).toHaveBeenCalledWith("sec1", { value: SENTINEL });
  });

  test("tags alone are sent without a value", async () => {
    resourcesInstance.secrets.edit.mockResolvedValue("Successfully Updated");

    const { secretEdit } = await import("./secret-edit.js");
    await secretEdit("sec1", { tagkey: ["env"], tagvalue: ["prod"] } as never);

    expect(resourcesInstance.secrets.edit).toHaveBeenCalledWith("sec1", { tags: [{ key: "env", value: "prod" }] });
  });

  /**
   * `SecretsEdit` has no `key` field: the API cannot rename a secret. Failing
   * offline with an actionable message beats a confusing API rejection.
   */
  test("attempting to change the key fails offline", async () => {
    const { secretEdit } = await import("./secret-edit.js");
    await expect(secretEdit("sec1", { key: "NEW_KEY", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/immutable_key/);

    expect(resourcesInstance.secrets.edit).not.toHaveBeenCalled();
  });

  test("the immutable-key message says what to do instead", async () => {
    const { secretEdit } = await import("./secret-edit.js");
    await expect(secretEdit("sec1", { key: "NEW_KEY", tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/delete|recreate/i);
  });

  test("--merge-tags reads the current tags and preserves those not named", async () => {
    resourcesInstance.secrets.info.mockResolvedValue({ tags: [{ key: "a", value: "1" }] });
    resourcesInstance.secrets.edit.mockResolvedValue("Successfully Updated");

    const { secretEdit } = await import("./secret-edit.js");
    await secretEdit("sec1", { tagkey: ["b"], tagvalue: ["2"], mergeTags: true } as never);

    expect(resourcesInstance.secrets.edit.mock.calls[0][1].tags).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  test("without --merge-tags the tag set is replaced and info is never read", async () => {
    resourcesInstance.secrets.edit.mockResolvedValue("Successfully Updated");

    const { secretEdit } = await import("./secret-edit.js");
    await secretEdit("sec1", { tagkey: ["b"], tagvalue: ["2"] } as never);

    expect(resourcesInstance.secrets.info).not.toHaveBeenCalled();
    expect(resourcesInstance.secrets.edit.mock.calls[0][1].tags).toEqual([{ key: "b", value: "2" }]);
  });

  test("uses the picker when no id is given", async () => {
    pickSecretIDMock.mockResolvedValue("picked1");
    resourcesInstance.secrets.edit.mockResolvedValue("Successfully Updated");
    prompts.inject([SENTINEL]);

    const { secretEdit } = await import("./secret-edit.js");
    await secretEdit(undefined, { rotate: true, tagkey: [], tagvalue: [] } as never);

    expect(resourcesInstance.secrets.edit).toHaveBeenCalledWith("picked1", { value: SENTINEL });
  });

  test("--silent without an id fails and never opens the picker", async () => {
    const { secretEdit } = await import("./secret-edit.js");
    await expect(secretEdit(undefined, { tagkey: ["b"], tagvalue: ["2"], silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickSecretIDMock).not.toHaveBeenCalled();
  });

  test("--rotate under --silent fails, since the value can only be typed", async () => {
    const { secretEdit } = await import("./secret-edit.js");
    await expect(secretEdit("sec1", { rotate: true, tagkey: [], tagvalue: [], silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(resourcesInstance.secrets.edit).not.toHaveBeenCalled();
  });

  /**
   * `secrets.edit` resolves a plain string ("Successfully Updated"), not an
   * object, so the ack is synthesized the way dict-delete synthesizes its own.
   */
  test("--json synthesizes an ack, since the SDK returns only a string", async () => {
    resourcesInstance.secrets.edit.mockResolvedValue("Successfully Updated");
    prompts.inject([SENTINEL]);

    const { secretEdit } = await import("./secret-edit.js");
    await secretEdit("sec1", { rotate: true, tagkey: [], tagvalue: [], json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: "sec1", updated: true });
  });

  test("the rotated value never reaches stdout or stderr", async () => {
    resourcesInstance.secrets.edit.mockResolvedValue("Successfully Updated");
    prompts.inject([SENTINEL]);

    const { secretEdit } = await import("./secret-edit.js");
    await secretEdit("sec1", { rotate: true, tagkey: [], tagvalue: [], json: true } as never);

    const written = [...stdoutSpy.mock.calls, ...stderrSpy.mock.calls].map((call) => String(call[0])).join("");
    expect(written).not.toContain(SENTINEL);
  });

  test("a rejected edit does not echo the value in its error", async () => {
    resourcesInstance.secrets.edit.mockRejectedValue(new Error("boom"));
    prompts.inject([SENTINEL]);

    const { secretEdit } = await import("./secret-edit.js");
    await expect(secretEdit("sec1", { rotate: true, tagkey: [], tagvalue: [] } as never)).rejects.toThrow(/edit_failed|boom/);

    const reported = errorHandlerMock.mock.calls.map((call) => String(call[0])).join("");
    expect(reported).not.toContain(SENTINEL);
  });
});
