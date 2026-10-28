import prompts from "prompts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const removeWidgetEntriesMock = vi.fn();

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

vi.mock("../../lib/resolve-scope.js", () => ({
  resolveScope: () => ({ scope: "local", root: "/repo" }),
}));

vi.mock("./widget-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./widget-config.js")>()),
  removeWidgetEntries: removeWidgetEntriesMock,
}));

const D = "6a68b4f5e4b1e5000b5ab1ef";
const W = "6ad1084c174a0b000cb231a4";

describe("widgetDelete", () => {
  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig({ widgetList: [{ folder: "users-summary", dashboard_id: D, widget_id: W }] }));
    removeWidgetEntriesMock.mockReset();
    resourcesInstance.dashboards.info.mockResolvedValue({ arrangement: [{ widget_id: W }, { widget_id: "other" }] });
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ label: "Users", type: "iframe" });
    resourcesInstance.dashboards.edit.mockResolvedValue("Successfully Updated");
    resourcesInstance.dashboards.widgets.delete.mockResolvedValue("Successfully Removed");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("takes the widget off the dashboard before deleting it, then drops its widgetList entry", async () => {
    const { widgetDelete } = await import("./widget-delete.js");
    await widgetDelete(W, { dashboard: D, environment: "dev", yes: true });

    expect(resourcesInstance.dashboards.edit).toHaveBeenCalledWith(D, { arrangement: [{ widget_id: "other" }] });
    expect(resourcesInstance.dashboards.widgets.delete).toHaveBeenCalledWith(D, W);
    expect(resourcesInstance.dashboards.edit.mock.invocationCallOrder[0]).toBeLessThan(resourcesInstance.dashboards.widgets.delete.mock.invocationCallOrder[0]);
    expect(removeWidgetEntriesMock).toHaveBeenCalledWith("dev", W);
  });

  test("a widget that is not a custom widget is never deleted", async () => {
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ label: "Chart", type: "line" });
    const { widgetDelete } = await import("./widget-delete.js");

    await expect(widgetDelete(W, { dashboard: D, yes: true })).rejects.toThrow(/not_custom_widget/);
    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
    expect(resourcesInstance.dashboards.widgets.delete).not.toHaveBeenCalled();
  });

  test("declining the confirmation changes nothing", async () => {
    prompts.inject([false]);
    const { widgetDelete } = await import("./widget-delete.js");
    await widgetDelete(W, { dashboard: D });

    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
    expect(resourcesInstance.dashboards.widgets.delete).not.toHaveBeenCalled();
  });

  test("a widget left in no arrangement is deleted without touching the layout", async () => {
    resourcesInstance.dashboards.info.mockResolvedValue({ arrangement: [] });
    const { widgetDelete } = await import("./widget-delete.js");
    await widgetDelete("6ad1084d5a0327000c5ac4ef", { dashboard: D, yes: true });

    expect(resourcesInstance.dashboards.edit).not.toHaveBeenCalled();
    expect(removeWidgetEntriesMock).not.toHaveBeenCalled();
  });
});
