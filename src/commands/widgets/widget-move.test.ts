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

const D = "6ae1f21478169f000cc15bcb";
const W = "6ae1f2314eb7ef000c778410";

describe("widgetMove", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ id: W, type: "iframe", label: "Customer" });
    resourcesInstance.dashboards.info.mockResolvedValue({
      tabs: [{ key: "app", value: "App", type: "single_widget" }],
      arrangement: [{ widget_id: W, x: 0, y: 0, width: 4, height: 10, tab: null }],
    });
    resourcesInstance.dashboards.edit.mockResolvedValue("Successfully Updated");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("moves a widget without a tab onto a single_widget tab, keeping its size", async () => {
    const { widgetMove } = await import("./widget-move.js");
    await widgetMove(W, { dashboard: D, tab: "app", json: true });

    expect(resourcesInstance.dashboards.edit).toHaveBeenCalledWith(D, { arrangement: [{ widget_id: W, x: 0, y: 0, width: 4, height: 10, tab: "app" }] });
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: W, tab: "app" });
  });

  test("an unknown tab fails before any change", async () => {
    const { widgetMove } = await import("./widget-move.js");

    await expect(widgetMove(W, { dashboard: D, tab: "main" })).rejects.toThrow(/invalid_tab.*Use one of: app/);
    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
  });

  test("nothing to move fails before any call", async () => {
    const { widgetMove } = await import("./widget-move.js");

    await expect(widgetMove(W, { dashboard: D })).rejects.toThrow(/no_changes/);
    expect(resourcesInstance.dashboards.widgets.info).not.toHaveBeenCalled();
  });

  test("a size that leaves the grid fails before the edit", async () => {
    const { widgetMove } = await import("./widget-move.js");

    await expect(widgetMove(W, { dashboard: D, x: 1 })).rejects.toThrow(/invalid_position/);
    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
  });

  test("only custom widgets move", async () => {
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ id: W, type: "line" });
    const { widgetMove } = await import("./widget-move.js");

    await expect(widgetMove(W, { dashboard: D, tab: "app" })).rejects.toThrow(/not_custom_widget/);
  });
});
