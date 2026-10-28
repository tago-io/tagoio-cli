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
  requireOrFail: async (value: string | undefined) => value,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

describe("dashboardCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.dashboards.create.mockResolvedValue({ dashboard: "d1" });
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Probed: one create call takes `type`, `tabs` and `blueprint_devices`, so a
   * Blueprint dashboard needs no follow-up edit.
   */
  test("sends a Blueprint dashboard with its tabs and slots in one create call", async () => {
    const slots = [{ name: "customer", type: "device", conditions: [{ key: "device_type", value: "customer" }] }];
    const { dashboardCreate } = await import("./dashboard-create.js");
    await dashboardCreate("Customer", { blueprint: true, blueprintDevices: JSON.stringify(slots), tab: ["main=Main"] });

    expect(resourcesInstance.dashboards.create).toHaveBeenCalledTimes(1);
    expect(resourcesInstance.dashboards.create.mock.calls[0][0]).toEqual({
      label: "Customer",
      visible: true,
      type: "blueprint",
      tabs: [{ key: "main", value: "Main" }],
      blueprint_devices: slots,
    });
    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
  });

  test("a Normal dashboard leaves the type to the API default", async () => {
    const { dashboardCreate } = await import("./dashboard-create.js");
    await dashboardCreate("Fleet", { hidden: true });

    expect(resourcesInstance.dashboards.create.mock.calls[0][0]).toEqual({ label: "Fleet", visible: false });
  });

  test("--icon and --icon-color go in the create call", async () => {
    const { dashboardCreate } = await import("./dashboard-create.js");
    await dashboardCreate("Fleet", { icon: "wifi", iconColor: "#8a3120" });

    expect(resourcesInstance.dashboards.create.mock.calls[0][0].icon).toEqual({ url: "https://svg.internal.tago.io/wifi.svg", color: "#8a3120" });
  });

  test("--icon-color without --icon fails before any call", async () => {
    const { dashboardCreate } = await import("./dashboard-create.js");

    await expect(dashboardCreate("Fleet", { iconColor: "#8a3120" })).rejects.toThrow(/missing_icon/);
    expect(resourcesInstance.dashboards.create).not.toHaveBeenCalled();
  });

  test("Blueprint slots without --blueprint fail before any call", async () => {
    const { dashboardCreate } = await import("./dashboard-create.js");

    await expect(dashboardCreate("Fleet", { blueprintDevices: "[]" })).rejects.toThrow(/needs --blueprint/);
    expect(resourcesInstance.dashboards.create).not.toHaveBeenCalled();
  });

  test("--json reports the new id and type", async () => {
    const { dashboardCreate } = await import("./dashboard-create.js");
    await dashboardCreate("Customer", { blueprint: true, json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "d1", label: "Customer", type: "blueprint", visible: true });
  });

  test("an API rejection reports create_failed", async () => {
    resourcesInstance.dashboards.create.mockRejectedValue(new Error("Invalid label"));
    const { dashboardCreate } = await import("./dashboard-create.js");

    await expect(dashboardCreate("x", {})).rejects.toThrow(/create_failed.*Invalid label/);
  });
});
