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
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-dashboard-id-from-tagoio.js", () => ({
  pickDashboardIDFromTagoIO: vi.fn(),
}));

describe("dashboardEdit", () => {
  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.dashboards.edit.mockResolvedValue("Successfully Updated");
    resourcesInstance.dashboards.info.mockResolvedValue({ id: "d1", tags: [{ key: "team", value: "ops" }] });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("sends only the fields asked for, without reading the dashboard", async () => {
    const { dashboardEdit } = await import("./dashboard-edit.js");
    await dashboardEdit("d1", { label: "Fleet", tab: ["main=Main"], hidden: true });

    expect(resourcesInstance.dashboards.edit).toHaveBeenCalledWith("d1", { label: "Fleet", tabs: [{ key: "main", value: "Main" }], visible: false });
    expect(resourcesInstance.dashboards.info).not.toHaveBeenCalled();
  });

  test("--merge-tags reads the stored tags and keeps the ones not named", async () => {
    const { dashboardEdit } = await import("./dashboard-edit.js");
    await dashboardEdit("d1", { tagkey: ["env"], tagvalue: ["prod"], mergeTags: true });

    expect(resourcesInstance.dashboards.edit.mock.calls[0][1].tags).toEqual([
      { key: "team", value: "ops" },
      { key: "env", value: "prod" },
    ]);
  });

  test("--icon-color alone keeps the stored icon", async () => {
    resourcesInstance.dashboards.info.mockResolvedValue({ id: "d1", icon: { url: "https://svg.internal.tago.io/wifi.svg", color: "#000" } });
    const { dashboardEdit } = await import("./dashboard-edit.js");
    await dashboardEdit("d1", { iconColor: "#8a3120" });

    expect(resourcesInstance.dashboards.edit).toHaveBeenCalledWith("d1", { icon: { url: "https://svg.internal.tago.io/wifi.svg", color: "#8a3120" } });
  });

  test("--icon-color on a dashboard without an icon fails before the edit", async () => {
    resourcesInstance.dashboards.info.mockResolvedValue({ id: "d1", icon: null });
    const { dashboardEdit } = await import("./dashboard-edit.js");

    await expect(dashboardEdit("d1", { iconColor: "#8a3120" })).rejects.toThrow(/missing_icon/);
    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
  });

  test("no flag fails with no_changes before any call", async () => {
    const { dashboardEdit } = await import("./dashboard-edit.js");

    await expect(dashboardEdit("d1", {})).rejects.toThrow(/no_changes/);
    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
  });

  test("--visible and --hidden together fail", async () => {
    const { dashboardEdit } = await import("./dashboard-edit.js");

    await expect(dashboardEdit("d1", { visible: true, hidden: true })).rejects.toThrow(/conflicting_flags/);
  });

  /** Probed: the API stores slots on a Normal dashboard and keeps its type, so the CLI refuses. */
  test("Blueprint slots on a Normal dashboard fail before the edit", async () => {
    resourcesInstance.dashboards.info.mockResolvedValue({ id: "d1", type: "dashboard" });
    const { dashboardEdit } = await import("./dashboard-edit.js");

    await expect(dashboardEdit("d1", { blueprintDevices: "[]" })).rejects.toThrow(/not_blueprint/);
    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
  });

  test("Blueprint slots on a Blueprint dashboard are sent", async () => {
    resourcesInstance.dashboards.info.mockResolvedValue({ id: "d1", type: "blueprint" });
    const { dashboardEdit } = await import("./dashboard-edit.js");
    await dashboardEdit("d1", { blueprintDevices: '[{"id":"s1","name":"customer"}]' });

    expect(resourcesInstance.dashboards.edit).toHaveBeenCalledWith("d1", { blueprint_devices: [{ id: "s1", name: "customer" }] });
  });

  test("an API rejection keeps the API's own message", async () => {
    resourcesInstance.dashboards.edit.mockRejectedValue(new Error("Invalid label"));
    const { dashboardEdit } = await import("./dashboard-edit.js");

    await expect(dashboardEdit("d1", { label: "x" })).rejects.toThrow(/edit_failed.*Invalid label/);
  });
});
