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

describe("actionEdit", () => {
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

    const { actionEdit } = await import("./action-edit.js");
    await expect(actionEdit("act1", { name: "X" } as never)).rejects.toThrow(/Environment not found/);
  });

  test("an empty patch is rejected without touching the API", async () => {
    const { actionEdit } = await import("./action-edit.js");
    await expect(actionEdit("act1", {} as never)).rejects.toThrow(/no_changes/);

    expect(resourcesInstance.actions.edit).not.toHaveBeenCalled();
    expect(resourcesInstance.actions.info).not.toHaveBeenCalled();
  });

  test("--name sends only the name, leaving trigger and action untouched", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit("act1", { name: "Renamed" } as never);

    expect(resourcesInstance.actions.edit).toHaveBeenCalledWith("act1", { name: "Renamed" });
  });

  test("--active and --inactive together are rejected before any API call", async () => {
    const { actionEdit } = await import("./action-edit.js");
    await expect(actionEdit("act1", { active: true, inactive: true } as never)).rejects.toThrow(/conflicting_flags/);

    expect(resourcesInstance.actions.edit).not.toHaveBeenCalled();
  });

  test("--inactive sets active false", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit("act1", { inactive: true } as never);

    expect(resourcesInstance.actions.edit).toHaveBeenCalledWith("act1", { active: false });
  });

  test("--merge-tags keeps tags that were not named on the command line", async () => {
    resourcesInstance.actions.info.mockResolvedValue({ tags: [{ key: "a", value: "1" }] });
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit("act1", { tagkey: ["b"], tagvalue: ["2"], mergeTags: true } as never);

    expect(resourcesInstance.actions.edit.mock.calls[0][1].tags).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
  });

  test("without --merge-tags the tag set is replaced and info is never read", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit("act1", { tagkey: ["b"], tagvalue: ["2"] } as never);

    expect(resourcesInstance.actions.info).not.toHaveBeenCalled();
    expect(resourcesInstance.actions.edit.mock.calls[0][1].tags).toEqual([{ key: "b", value: "2" }]);
  });

  test("--trigger-json replaces the whole trigger array", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit("act1", { triggerJson: '[{"interval":"1 hour"}]' } as never);

    expect(resourcesInstance.actions.edit.mock.calls[0][1].trigger).toEqual([{ interval: "1 hour" }]);
  });

  test("--action-json replaces the whole action object", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit("act1", { actionJson: '{"type":"script","script":["a1"]}' } as never);

    expect(resourcesInstance.actions.edit.mock.calls[0][1].action).toEqual({ type: "script", script: ["a1"] });
  });

  test("malformed --trigger-json is rejected before any API call", async () => {
    const { actionEdit } = await import("./action-edit.js");
    await expect(actionEdit("act1", { triggerJson: "{" } as never)).rejects.toThrow(/invalid_json/);

    expect(resourcesInstance.actions.edit).not.toHaveBeenCalled();
  });

  test("uses the picker when no id is given", async () => {
    pickActionIDMock.mockResolvedValue("picked1");
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit(undefined, { name: "X" } as never);

    expect(resourcesInstance.actions.edit).toHaveBeenCalledWith("picked1", { name: "X" });
  });

  test("--silent without an id fails and never opens the picker", async () => {
    const { actionEdit } = await import("./action-edit.js");
    await expect(actionEdit(undefined, { name: "X", silent: true } as never)).rejects.toThrow(/missing_input/);

    expect(pickActionIDMock).not.toHaveBeenCalled();
  });

  test("--json reports the updated id", async () => {
    resourcesInstance.actions.edit.mockResolvedValue("ok");

    const { actionEdit } = await import("./action-edit.js");
    await actionEdit("act1", { name: "X", json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "act1", updated: true });
  });

  test("an API rejection reports edit_failed", async () => {
    resourcesInstance.actions.edit.mockRejectedValue(new Error("boom"));

    const { actionEdit } = await import("./action-edit.js");
    await expect(actionEdit("act1", { name: "X" } as never)).rejects.toThrow(/edit_failed|boom/);
  });
});
