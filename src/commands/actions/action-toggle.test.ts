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

describe("actionEnable / actionDisable", () => {
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

  test("actionDisable sends exactly { active: false }", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionDisable } = await import("./action-toggle.js");
    await actionDisable("act1", {} as never);

    expect(resourcesInstance.actions.edit).toHaveBeenCalledWith("act1", { active: false });
  });

  test("actionEnable sends exactly { active: true }", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEnable } = await import("./action-toggle.js");
    await actionEnable("act1", {} as never);

    expect(resourcesInstance.actions.edit).toHaveBeenCalledWith("act1", { active: true });
  });

  // Toggling is not destructive, so it must never stop to ask.
  test("neither command prompts for confirmation", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");
    const promptSpy = vi.spyOn(prompts, "prompt");

    const { actionEnable } = await import("./action-toggle.js");
    await actionEnable("act1", {} as never);

    expect(promptSpy).not.toHaveBeenCalled();
  });

  test("uses the picker when no id is given", async () => {
    pickActionIDMock.mockResolvedValue("picked1");
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEnable } = await import("./action-toggle.js");
    await actionEnable(undefined, {} as never);

    expect(resourcesInstance.actions.edit).toHaveBeenCalledWith("picked1", { active: true });
  });

  test("--silent without an id fails and never opens the picker", async () => {
    const { actionDisable } = await import("./action-toggle.js");
    await expect(actionDisable(undefined, { silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickActionIDMock).not.toHaveBeenCalled();
    expect(resourcesInstance.actions.edit).not.toHaveBeenCalled();
  });

  test("--json reports the updated id", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionDisable } = await import("./action-toggle.js");
    await actionDisable("act1", { json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "act1", updated: true });
  });

  test("fails when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { actionEnable } = await import("./action-toggle.js");
    await expect(actionEnable("act1", {} as never)).rejects.toThrow(/Environment not found/);
  });

  test("an API rejection reports edit_failed", async () => {
    resourcesInstance.actions.edit.mockRejectedValue(new Error("boom"));

    const { actionEnable } = await import("./action-toggle.js");
    await expect(actionEnable("act1", {} as never)).rejects.toThrow(/edit_failed|boom/);
  });
});
