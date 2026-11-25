import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const listDashboardWidgetsMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getApiURL: () => "https://api.us-e1.tago.io",
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/custom-widget-transport.js", () => ({
  listDashboardWidgets: listDashboardWidgetsMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-dashboard-id-from-tagoio.js", () => ({
  pickDashboardIDFromTagoIO: vi.fn(),
}));

describe("widgetList", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.dashboards.info.mockResolvedValue({
      arrangement: [
        { widget_id: "w1", x: 0, y: 0, width: 4, height: 6, tab: "main" },
        { widget_id: "w2", x: 0, y: 6, width: 2, height: 2 },
        { widget_id: "w3", x: 2, y: 6, width: 2, height: 2, tab: "main" },
      ],
    });
    // w3 is placed but missing from the listing.
    listDashboardWidgetsMock.mockReset().mockResolvedValue([
      { id: "w1", label: "Users", type: "iframe" },
      { id: "w2", label: "Total", type: "display" },
    ]);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("lists every placed widget with its position, keeping an unreadable one visible", async () => {
    const { widgetList } = await import("./widget-list.js");
    await widgetList("d1", { json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual([
      { id: "w1", label: "Users", type: "iframe", tab: "main", x: 0, y: 0, width: 4, height: 6 },
      { id: "w2", label: "Total", type: "display", tab: null, x: 0, y: 6, width: 2, height: 2 },
      { id: "w3", label: "(unreadable)", type: "(unreadable)", tab: "main", x: 2, y: 6, width: 2, height: 2 },
    ]);
    expect(listDashboardWidgetsMock).toHaveBeenCalledTimes(1);
    expect(listDashboardWidgetsMock).toHaveBeenCalledWith({ apiURL: "https://api.us-e1.tago.io", token: expect.any(String) }, "d1");
    expect(resourcesInstance.dashboards.widgets.info).not.toHaveBeenCalled();
  });

  test("--type keeps only that type", async () => {
    const { widgetList } = await import("./widget-list.js");
    await widgetList("d1", { type: "iframe", json: true });

    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0])).map((row: { id: string }) => row.id)).toEqual(["w1"]);
  });

  test("an unknown dashboard reports not_found", async () => {
    resourcesInstance.dashboards.info.mockRejectedValue(new Error("Dashboard Not Found"));
    const { widgetList } = await import("./widget-list.js");

    await expect(widgetList("nope", {})).rejects.toThrow(/not_found/);
  });
});
