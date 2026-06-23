import prompts from "prompts";
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

describe("deviceDelete", () => {
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

  test("deletes after the user confirms", async () => {
    resourcesInstance.devices.delete.mockResolvedValue("deleted");
    prompts.inject([true]);

    const { deviceDelete } = await import("./device-delete.js");
    await deviceDelete("dev-1", {} as never);

    expect(resourcesInstance.devices.delete).toHaveBeenCalledWith("dev-1");
  });

  test("declining the confirmation makes no delete call", async () => {
    prompts.inject([false]);

    const { deviceDelete } = await import("./device-delete.js");
    await deviceDelete("dev-1", {} as never);

    expect(resourcesInstance.devices.delete).not.toHaveBeenCalled();
  });

  test("-y skips the confirmation", async () => {
    resourcesInstance.devices.delete.mockResolvedValue("deleted");

    const { deviceDelete } = await import("./device-delete.js");
    await deviceDelete("dev-1", { yes: true } as never);

    expect(resourcesInstance.devices.delete).toHaveBeenCalledWith("dev-1");
  });

  test("picks an id interactively when none is given", async () => {
    resourcesInstance.devices.delete.mockResolvedValue("deleted");
    pickDeviceIDMock.mockResolvedValue("picked-dev");
    prompts.inject([true]);

    const { deviceDelete } = await import("./device-delete.js");
    await deviceDelete(undefined, {} as never);

    expect(pickDeviceIDMock).toHaveBeenCalled();
    expect(resourcesInstance.devices.delete).toHaveBeenCalledWith("picked-dev");
  });

  test("--silent with no id errors with missing_input", async () => {
    const { deviceDelete } = await import("./device-delete.js");
    await expect(deviceDelete(undefined, { silent: true, json: true } as never)).rejects.toThrow(/json:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.stringContaining("id"), "missing_input");
    expect(pickDeviceIDMock).not.toHaveBeenCalled();
  });

  test("--json emits {id, deleted:true}", async () => {
    resourcesInstance.devices.delete.mockResolvedValue("deleted");

    const { deviceDelete } = await import("./device-delete.js");
    await deviceDelete("dev-j", { yes: true, json: true } as never);

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "dev-j", deleted: true });
  });

  test("SDK failure routes through errorHandler", async () => {
    resourcesInstance.devices.delete.mockRejectedValue(new Error("boom"));

    const { deviceDelete } = await import("./device-delete.js");
    await expect(deviceDelete("dev-x", { yes: true } as never)).rejects.toThrow(/Failed to delete device dev-x: boom/);
  });
});
