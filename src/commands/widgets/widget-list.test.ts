import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();

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
    resourcesInstance.dashboards.widgets.info.mockImplementation(async (_d: string, id: string) => {
      if (id === "w3") {
        throw new Error("Widget Not Found");
      }
      return { label: id === "w1" ? "Users" : "Total", type: id === "w1" ? "iframe" : "display" };
    });
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
