import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, _code?: string) => {
  throw new Error(`json:${message}`);
});
const pickDeviceIDMock = vi.fn();

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

vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: pickDeviceIDMock,
}));

describe("deviceEdit", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    pickDeviceIDMock.mockReset();
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("edits the device name", async () => {
    resourcesInstance.devices.edit.mockResolvedValue("updated");

    const { deviceEdit } = await import("./device-edit.js");
    await deviceEdit("dev-1", { name: "Renamed" } as never);

    expect(resourcesInstance.devices.edit).toHaveBeenCalledWith("dev-1", expect.objectContaining({ name: "Renamed" }));
  });

  test("no edit fields → no_changes error, no SDK call", async () => {
    const { deviceEdit } = await import("./device-edit.js");
    await expect(deviceEdit("dev-1", { json: true } as never)).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.any(String), "no_changes");
    expect(resourcesInstance.devices.edit).not.toHaveBeenCalled();
  });

  test("--active and --inactive set the active flag", async () => {
    resourcesInstance.devices.edit.mockResolvedValue("updated");

    const { deviceEdit } = await import("./device-edit.js");
    await deviceEdit("dev-1", { inactive: true } as never);

    expect(resourcesInstance.devices.edit).toHaveBeenCalledWith("dev-1", expect.objectContaining({ active: false }));
  });

  test("default tag behavior replaces the whole tag set", async () => {
    resourcesInstance.devices.edit.mockResolvedValue("updated");

    const { deviceEdit } = await import("./device-edit.js");
    await deviceEdit("dev-1", { tagkey: ["type"], tagvalue: ["sensor"] } as never);

    expect(resourcesInstance.devices.info).not.toHaveBeenCalled();
    expect(resourcesInstance.devices.edit).toHaveBeenCalledWith(
      "dev-1",
      expect.objectContaining({ tags: [{ key: "type", value: "sensor" }] }),
    );
  });

  test("--merge-tags merges new tags into existing ones, overriding matching keys", async () => {
    resourcesInstance.devices.info.mockResolvedValue({
      tags: [{ key: "type", value: "old" }, { key: "site", value: "hq" }],
    });
    resourcesInstance.devices.edit.mockResolvedValue("updated");

    const { deviceEdit } = await import("./device-edit.js");
    await deviceEdit("dev-1", { tagkey: ["type", "zone"], tagvalue: ["sensor", "a"], mergeTags: true } as never);

    expect(resourcesInstance.devices.info).toHaveBeenCalledWith("dev-1");
    const sentTags = resourcesInstance.devices.edit.mock.calls[0][1].tags;
    expect(sentTags).toEqual(
      expect.arrayContaining([
        { key: "type", value: "sensor" },
        { key: "site", value: "hq" },
        { key: "zone", value: "a" },
      ]),
    );
    expect(sentTags).toHaveLength(3);
  });

  test("--json emits {id, updated:true}", async () => {
    resourcesInstance.devices.edit.mockResolvedValue("updated");

    const { deviceEdit } = await import("./device-edit.js");
    await deviceEdit("dev-j", { name: "N", json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "dev-j", updated: true });
  });

  test("--silent with no id errors with missing_input", async () => {
    const { deviceEdit } = await import("./device-edit.js");
    await expect(deviceEdit(undefined, { name: "x", silent: true, json: true } as never)).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("id"), "missing_input");
  });

  test("SDK failure routes through errorHandler", async () => {
    resourcesInstance.devices.edit.mockRejectedValue(new Error("boom"));

    const { deviceEdit } = await import("./device-edit.js");
    await expect(deviceEdit("dev-x", { name: "x" } as never)).rejects.toThrow(/Failed to edit device dev-x: boom/);
  });

  test("applyDeviceEdit is exported and performs the edit + json output", async () => {
    resourcesInstance.devices.edit.mockResolvedValue("updated");

    const { applyDeviceEdit } = await import("./device-edit.js");
    await applyDeviceEdit(resourcesInstance as never, "dev-h", { network: "n", connector: "c" }, { json: true });

    expect(resourcesInstance.devices.edit).toHaveBeenCalledWith("dev-h", { network: "n", connector: "c" });
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "dev-h", updated: true });
  });
});
