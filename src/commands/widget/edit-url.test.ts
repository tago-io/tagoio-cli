import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, successMSGMock, infoMSGMock, widgetInfoMock, widgetEditMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  successMSGMock: vi.fn(),
  infoMSGMock: vi.fn(),
  widgetInfoMock: vi.fn(),
  widgetEditMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return { dashboards: { widgets: { info: widgetInfoMock, edit: widgetEditMock } } };
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: (...args: unknown[]) => getEnvironmentConfigMock(...args),
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: successMSGMock,
  infoMSG: infoMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

import { widgetEditURLCommand } from "./edit-url.js";

const NEW_URL = "https://api.us-e1.tago.io/file/p/custom-widgets/line-chart/index.html";

describe("widgetEditURLCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    widgetInfoMock.mockResolvedValue({
      id: "widget-1",
      type: "iframe",
      label: "Custom Widget #1",
      display: {
        url: "https://old.example.com/index.html",
        parameters: [{ key: "foo", value: "bar" }],
        theme: { color: { background: "#222" } },
        frame_settings: { header_visibility: "show_only_buttons" },
        header_buttons: [],
      },
    });
    widgetEditMock.mockResolvedValue("ok");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("sets display.url to the new URL", async () => {
    await widgetEditURLCommand("dash-1", "widget-1", NEW_URL, {});

    expect(widgetEditMock).toHaveBeenCalledTimes(1);
    const [dashboardID, widgetID, payload] = widgetEditMock.mock.calls[0];
    expect(dashboardID).toBe("dash-1");
    expect(widgetID).toBe("widget-1");
    expect(payload.display.url).toBe(NEW_URL);
  });

  test("preserves every other display field (read-modify-write)", async () => {
    await widgetEditURLCommand("dash-1", "widget-1", NEW_URL, {});

    const { display } = widgetEditMock.mock.calls[0][2];
    expect(display.parameters).toEqual([{ key: "foo", value: "bar" }]);
    expect(display.theme).toEqual({ color: { background: "#222" } });
    expect(display.frame_settings).toEqual({ header_visibility: "show_only_buttons" });
    expect(display.header_buttons).toEqual([]);
  });

  test("rejects a non-iframe widget without editing", async () => {
    widgetInfoMock.mockResolvedValue({ id: "widget-1", type: "display", display: {} });

    await expect(widgetEditURLCommand("dash-1", "widget-1", NEW_URL, {})).rejects.toThrow(/iframe|custom widget/i);
    expect(widgetEditMock).not.toHaveBeenCalled();
  });

  test("fails fast when no profile token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(widgetEditURLCommand("dash-1", "widget-1", NEW_URL, {})).rejects.toThrow(/token/i);
    expect(widgetInfoMock).not.toHaveBeenCalled();
  });

  test("surfaces an error when the widget cannot be found", async () => {
    widgetInfoMock.mockRejectedValue(new Error("Widget not found"));

    await expect(widgetEditURLCommand("dash-1", "missing", NEW_URL, {})).rejects.toThrow(/not found/i);
    expect(widgetEditMock).not.toHaveBeenCalled();
  });

  test("surfaces an error when the widget edit fails", async () => {
    widgetEditMock.mockRejectedValue(new Error("edit rejected"));

    await expect(widgetEditURLCommand("dash-1", "widget-1", NEW_URL, {})).rejects.toThrow(/edit rejected|update failed/i);
  });

  test("uses the --token override", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await widgetEditURLCommand("dash-1", "widget-1", NEW_URL, { token: "cli-token" });

    expect(widgetEditMock).toHaveBeenCalledTimes(1);
  });
});
