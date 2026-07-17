import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

const accountDevicesInfoMock = vi.fn();
const deviceInfoMock = vi.fn();
const deviceGetDataMock = vi.fn();
const deviceDeleteDataMock = vi.fn();
const deviceEmptyDataMock = vi.fn();
const pickDeviceIDFromTagoIOMock = vi.fn();
const postDeviceDataMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return {
      devices: {
        info: (...args: unknown[]) => accountDevicesInfoMock(...args),
        getDeviceData: (...args: unknown[]) => deviceGetDataMock(...args),
        deleteDeviceData: (...args: unknown[]) => deviceDeleteDataMock(...args),
        emptyDeviceData: (...args: unknown[]) => deviceEmptyDataMock(...args),
      },
    };
  },
  Device: function Device() {
    return {
      info: (...args: unknown[]) => deviceInfoMock(...args),
    };
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: (...args: unknown[]) => pickDeviceIDFromTagoIOMock(...args),
}));

vi.mock("./data-post.js", () => ({
  postDeviceData: (...args: unknown[]) => postDeviceDataMock(...args),
}));

describe("_createDataFilter", () => {
  test("creates filter from all options", async () => {
    const { _createDataFilter } = await import("./data-get.js");
    const filter = _createDataFilter({
      var: ["temperature", "humidity"],
      group: "daily",
      startDate: "2022-01-01",
      endDate: "2022-01-31",
      qty: "100",
      query: "avg",
    } as never);
    expect(filter).toEqual({
      variables: ["temperature", "humidity"],
      groups: "daily",
      start_date: "2022-01-01",
      end_date: "2022-01-31",
      qty: 100,
      query: "avg",
    });
  });

  test("returns empty object when no options provided", async () => {
    const { _createDataFilter } = await import("./data-get.js");
    expect(_createDataFilter({} as never)).toEqual({});
  });

  test("drops an empty --var array (commander default) instead of sending variables:[]", async () => {
    const { _createDataFilter } = await import("./data-get.js");
    expect(_createDataFilter({ var: [] } as never)).toEqual({});
  });
});

describe("getDeviceData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    errorHandlerMock.mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
  });

  test("delegates to postDeviceData when options.post is set", async () => {
    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("device-id", { post: "{...}" } as never);
    expect(postDeviceDataMock).toHaveBeenCalledWith("device-id", { post: "{...}" });
  });

  test("calls errorHandler when environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { getDeviceData } = await import("./data-get.js");
    await expect(getDeviceData("id", { post: "" } as never)).rejects.toThrow(/Environment not found/);
  });

  test("fetches device data by token (36-char) and prints table", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceGetDataMock.mockResolvedValue([{ variable: "temp", value: 25 }]);
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);

    const token = "a".repeat(36);
    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData(token, { post: "" } as never);

    expect(deviceInfoMock).toHaveBeenCalled();
    expect(deviceGetDataMock).toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalled();
    tableSpy.mockRestore();
  });

  test("fetches device by id when length is not 36", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountDevicesInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceGetDataMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("short-id", { post: "", json: true } as never);
    expect(accountDevicesInfoMock).toHaveBeenCalledWith("short-id");
    expect(deviceGetDataMock).toHaveBeenCalledWith("dev", expect.any(Object));
  });

  test("emits pretty-printed JSON to stdout when --stringify is set", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceGetDataMock.mockResolvedValue([{ variable: "x", value: 1 }]);
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { post: "", stringify: true } as never);
    expect(stdoutSpy).toHaveBeenCalled();
    const output = String(stdoutSpy.mock.calls[0][0]);
    expect(() => JSON.parse(output)).not.toThrow();
    expect(output).toContain("\n  "); // pretty-printed
    stdoutSpy.mockRestore();
  });

  test("prompts for device id when not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickDeviceIDFromTagoIOMock.mockResolvedValue("picked-id");
    accountDevicesInfoMock.mockResolvedValue({ id: "dev", name: "X", type: "mutable" });
    deviceGetDataMock.mockResolvedValue([]);
    vi.spyOn(console, "table").mockImplementation(() => undefined);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("", { post: "" } as never);
    expect(pickDeviceIDFromTagoIOMock).toHaveBeenCalled();
  });

  test("--delete deletes data matching the query filter after confirmation", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceDeleteDataMock.mockResolvedValue("3 Data Removed");
    prompts.inject([true]);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { delete: true, var: ["temperature"] } as never);

    expect(deviceDeleteDataMock).toHaveBeenCalledWith("dev", expect.objectContaining({ variables: ["temperature"] }));
    expect(deviceGetDataMock).not.toHaveBeenCalled();
  });

  test("--delete -y skips confirmation", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceDeleteDataMock.mockResolvedValue("3 Data Removed");

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { delete: true, var: ["temperature"], yes: true } as never);

    expect(deviceDeleteDataMock).toHaveBeenCalledWith("dev", expect.objectContaining({ variables: ["temperature"] }));
  });

  test("--delete without confirmation makes no delete call", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    prompts.inject([false]);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { delete: true, var: ["temperature"] } as never);

    expect(deviceDeleteDataMock).not.toHaveBeenCalled();
  });

  // Commander injects defaults for options the user never passed: `--qty` → 15
  // and `--var` → []. Neither narrows a delete, so a bare `--delete` carrying
  // only these must still be rejected — otherwise it silently wipes the device.
  test("--delete with only commander defaults (qty + empty var) is rejected (never a silent full wipe)", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });

    const { getDeviceData } = await import("./data-get.js");
    await expect(getDeviceData("a".repeat(36), { delete: true, qty: "15", var: [] } as never)).rejects.toThrow(
      /requires at least one filter/,
    );
    expect(deviceDeleteDataMock).not.toHaveBeenCalled();
  });

  test("--empty deletes all data after confirmation via emptyDeviceData", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceEmptyDataMock.mockResolvedValue("All Data Removed");
    prompts.inject([true]);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { empty: true } as never);

    expect(deviceEmptyDataMock).toHaveBeenCalledWith("dev");
  });

  test("--empty without confirmation makes no delete call", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    prompts.inject([false]);

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { empty: true } as never);

    expect(deviceEmptyDataMock).not.toHaveBeenCalled();
  });

  test("--empty -y skips confirmation", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    deviceInfoMock.mockResolvedValue({ id: "dev", name: "Device", type: "mutable" });
    deviceEmptyDataMock.mockResolvedValue("All Data Removed");

    const { getDeviceData } = await import("./data-get.js");
    await getDeviceData("a".repeat(36), { empty: true, yes: true } as never);

    expect(deviceEmptyDataMock).toHaveBeenCalledWith("dev");
  });

  test("--delete together with --post is rejected (mutual exclusivity)", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());

    const { getDeviceData } = await import("./data-get.js");
    await expect(getDeviceData("a".repeat(36), { delete: true, post: "{...}" } as never)).rejects.toThrow(
      /mutually exclusive/,
    );
    expect(postDeviceDataMock).not.toHaveBeenCalled();
  });

  test("--delete and --empty together is rejected", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());

    const { getDeviceData } = await import("./data-get.js");
    await expect(getDeviceData("a".repeat(36), { delete: true, empty: true } as never)).rejects.toThrow(
      /mutually exclusive/,
    );
  });
});
