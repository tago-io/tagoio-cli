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

describe("secretDelete", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickSecretIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { secretDelete } = await import("./secret-delete.js");
    await expect(secretDelete("sec1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  // A declined confirmation is a normal outcome, not a failure: no call, exit 0.
  test("declining the confirmation makes no delete call and returns normally", async () => {
    resourcesInstance.secrets.info.mockResolvedValue({ key: "TWILIO_SID" });
    prompts.inject([false]);

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete("sec1", {} as never);

    expect(resourcesInstance.secrets.delete).not.toHaveBeenCalled();
  });

  test("confirming triggers the delete", async () => {
    resourcesInstance.secrets.info.mockResolvedValue({ key: "TWILIO_SID" });
    resourcesInstance.secrets.delete.mockResolvedValue("Successfully Removed");
    prompts.inject([true]);

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete("sec1", {} as never);

    expect(resourcesInstance.secrets.delete).toHaveBeenCalledWith("sec1");
  });

  /**
   * The key is what an operator recognises — the id is opaque, and the value is
   * unreadable. Naming it is the only way the prompt can show what is at stake.
   */
  test("the confirmation reads the key so the prompt can name it", async () => {
    resourcesInstance.secrets.info.mockResolvedValue({ key: "TWILIO_SID" });
    resourcesInstance.secrets.delete.mockResolvedValue("Successfully Removed");
    prompts.inject([true]);

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete("sec1", {} as never);

    expect(resourcesInstance.secrets.info).toHaveBeenCalledWith("sec1");
  });

  test("an unreadable secret still deletes after confirmation", async () => {
    resourcesInstance.secrets.info.mockRejectedValue(new Error("nope"));
    resourcesInstance.secrets.delete.mockResolvedValue("Successfully Removed");
    prompts.inject([true]);

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete("sec1", {} as never);

    expect(resourcesInstance.secrets.delete).toHaveBeenCalledWith("sec1");
  });

  test("-y deletes without prompting or reading info", async () => {
    resourcesInstance.secrets.delete.mockResolvedValue("Successfully Removed");

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete("sec1", { yes: true } as never);

    expect(resourcesInstance.secrets.delete).toHaveBeenCalledWith("sec1");
    expect(resourcesInstance.secrets.info).not.toHaveBeenCalled();
  });

  test("--silent deletes without prompting", async () => {
    resourcesInstance.secrets.delete.mockResolvedValue("Successfully Removed");

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete("sec1", { silent: true } as never);

    expect(resourcesInstance.secrets.delete).toHaveBeenCalledWith("sec1");
  });

  test("--silent without an id fails, opening no picker and deleting nothing", async () => {
    const { secretDelete } = await import("./secret-delete.js");
    await expect(secretDelete(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickSecretIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.secrets.delete).not.toHaveBeenCalled();
  });

  test("uses the picker when no id is given", async () => {
    pickSecretIDMock.mockResolvedValue("picked1");
    resourcesInstance.secrets.delete.mockResolvedValue("Successfully Removed");

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete(undefined, { yes: true } as never);

    expect(resourcesInstance.secrets.delete).toHaveBeenCalledWith("picked1");
  });

  /** `secrets.delete` resolves a plain string, so the ack is synthesized. */
  test("--json synthesizes the deleted ack", async () => {
    resourcesInstance.secrets.delete.mockResolvedValue("Successfully Removed");

    const { secretDelete } = await import("./secret-delete.js");
    await secretDelete("sec1", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "sec1", deleted: true });
  });

  test("an API rejection reports delete_failed", async () => {
    resourcesInstance.secrets.delete.mockRejectedValue(new Error("boom"));

    const { secretDelete } = await import("./secret-delete.js");
    await expect(secretDelete("sec1", { yes: true } as never)).rejects.toThrow(/delete_failed|boom/);
  });

  test("an API rejection reports through the JSON channel when --json is set", async () => {
    resourcesInstance.secrets.delete.mockRejectedValue(new Error("boom"));

    const { secretDelete } = await import("./secret-delete.js");
    await expect(secretDelete("sec1", { yes: true, json: true } as never)).rejects.toThrow(/^json:delete_failed:/);
  });
});
