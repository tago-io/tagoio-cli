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
const pickActionIDMock = vi.fn();

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

vi.mock("../../prompt/pick-action-id-from-tagoio.js", () => ({
  pickActionIDFromTagoIO: pickActionIDMock,
}));

describe("actionDelete", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickActionIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { actionDelete } = await import("./action-delete.js");
    await expect(actionDelete("act1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  // A declined confirmation is a normal outcome, not a failure: no call, exit 0.
  test("declining the confirmation makes no delete call and returns normally", async () => {
    prompts.inject([false]);

    const { actionDelete } = await import("./action-delete.js");
    await actionDelete("act1", {} as never);

    expect(resourcesInstance.actions.delete).not.toHaveBeenCalled();
  });

  test("confirming triggers the delete", async () => {
    resourcesInstance.actions.delete.mockResolvedValue("ok");
    prompts.inject([true]);

    const { actionDelete } = await import("./action-delete.js");
    await actionDelete("act1", {} as never);

    expect(resourcesInstance.actions.delete).toHaveBeenCalledWith("act1");
  });

  test("-y deletes without prompting", async () => {
    resourcesInstance.actions.delete.mockResolvedValue("ok");

    const { actionDelete } = await import("./action-delete.js");
    await actionDelete("act1", { yes: true } as never);

    expect(resourcesInstance.actions.delete).toHaveBeenCalledWith("act1");
  });

  test("--silent deletes without prompting", async () => {
    resourcesInstance.actions.delete.mockResolvedValue("ok");

    const { actionDelete } = await import("./action-delete.js");
    await actionDelete("act1", { silent: true } as never);

    expect(resourcesInstance.actions.delete).toHaveBeenCalledWith("act1");
  });

  test("--silent without an id fails, opening no picker and deleting nothing", async () => {
    const { actionDelete } = await import("./action-delete.js");
    await expect(actionDelete(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickActionIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.actions.delete).not.toHaveBeenCalled();
  });

  test("uses the picker when no id is given", async () => {
    pickActionIDMock.mockResolvedValue("picked1");
    resourcesInstance.actions.delete.mockResolvedValue("ok");
    prompts.inject([true]);

    const { actionDelete } = await import("./action-delete.js");
    await actionDelete(undefined, {} as never);

    expect(resourcesInstance.actions.delete).toHaveBeenCalledWith("picked1");
  });

  test("--json reports the deleted id", async () => {
    resourcesInstance.actions.delete.mockResolvedValue("ok");

    const { actionDelete } = await import("./action-delete.js");
    await actionDelete("act1", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "act1", deleted: true });
  });

  test("an API rejection reports delete_failed", async () => {
    resourcesInstance.actions.delete.mockRejectedValue(new Error("boom"));

    const { actionDelete } = await import("./action-delete.js");
    await expect(actionDelete("act1", { yes: true } as never)).rejects.toThrow(/delete_failed|boom/);
  });

  test("an API rejection reports through the JSON channel when --json is set", async () => {
    resourcesInstance.actions.delete.mockRejectedValue(new Error("boom"));

    const { actionDelete } = await import("./action-delete.js");
    await expect(actionDelete("act1", { yes: true, json: true } as never)).rejects.toThrow(/^json:delete_failed:/);
  });
});
