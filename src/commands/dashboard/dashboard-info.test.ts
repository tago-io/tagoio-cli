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
const writeStatusMock = vi.fn();

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
  infoMSG: vi.fn(),
  writeStatus: writeStatusMock,
}));

vi.mock("../../prompt/pick-dashboard-id-from-tagoio.js", () => ({
  pickDashboardIDFromTagoIO: vi.fn(),
}));

const DASHBOARD = {
  id: "d1",
  label: "QA Test",
  type: "blueprint",
  visible: true,
  tabs: [
    { key: "main", value: "Main" },
    { key: "app", value: "App", type: "single_widget" },
  ],
  arrangement: [
    { widget_id: "w1", x: 0, y: 0, width: 4, height: 6, tab: "main" },
    { widget_id: "w2", x: 0, y: 6, width: 4, height: 6, tab: "main" },
  ],
  blueprint_devices: [
    { id: "slot1", name: "customer", type: "device", conditions: [{ key: "device_type", value: "customer" }] },
    {
      id: "slot2",
      name: "compressor",
      type: "device",
      conditions: [{ key: "device_type", value: "sensor" }],
      filter_conditions: [{ type: "tag_match", tag_key: "customer_id", blueprint_device: "customer" }],
    },
  ],
  shared: { token: "SENTINEL_TOKEN" },
  tags: [],
};

describe("dashboardInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    writeStatusMock.mockClear();
    resourcesInstance.dashboards.info.mockResolvedValue(DASHBOARD);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("--silent without an id fails and never prompts", async () => {
    const { dashboardInfo } = await import("./dashboard-info.js");

    await expect(dashboardInfo(undefined, { silent: true })).rejects.toThrow(/missing_input/);
  });

  test("--json drops nested token fields", async () => {
    const { dashboardInfo } = await import("./dashboard-info.js");
    await dashboardInfo("d1", { json: true });

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(written).not.toContain("SENTINEL_TOKEN");
    expect(JSON.parse(written).blueprint_devices[0].id).toBe("slot1");
  });

  test("the human view lists tab keys with their widget counts and the slot IDs", async () => {
    const { dashboardInfo } = await import("./dashboard-info.js");
    await dashboardInfo("d1", {});

    const lines = writeStatusMock.mock.calls.map(([line]) => String(line));
    expect(lines).toContainEqual(expect.stringContaining("main = Main  widgets: 2"));
    expect(lines).toContainEqual(expect.stringContaining("app = App (single_widget)  widgets: 0"));
    expect(lines).toContainEqual(expect.stringContaining("customer [slot1] (device: device_type=customer)"));
    expect(lines).toContainEqual(expect.stringContaining("compressor [slot2] (device: device_type=sensor; filtered by customer_id=<customer>)"));
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  test("an unknown id reports not_found", async () => {
    resourcesInstance.dashboards.info.mockRejectedValue(new Error("Dashboard Not Found"));
    const { dashboardInfo } = await import("./dashboard-info.js");

    await expect(dashboardInfo("nope", {})).rejects.toThrow(/not_found/);
  });
});

describe("countWidgetsByTab", () => {
  test("groups placements without a tab under (no tab)", async () => {
    const { countWidgetsByTab } = await import("./dashboard-info.js");

    expect(countWidgetsByTab({ arrangement: [{ widget_id: "w1", x: 0, y: 0, width: 1, height: 1, tab: null }] })).toEqual({ "(no tab)": 1 });
  });
});
