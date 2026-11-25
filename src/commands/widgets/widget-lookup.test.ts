import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../test-utils/mock-sdk.js";

const pickDashboardMock = vi.fn();
const listDashboardWidgetsMock = vi.fn();
const transport = { apiURL: "https://api.us-e1.tago.io", token: "t" };

vi.mock("../../lib/messages.js", () => ({
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
}));

vi.mock("../../lib/custom-widget-transport.js", () => ({
  listDashboardWidgets: listDashboardWidgetsMock,
}));

vi.mock("../../prompt/pick-dashboard-id-from-tagoio.js", () => ({
  pickDashboardIDFromTagoIO: pickDashboardMock,
}));

describe("resolveDashboardID", () => {
  beforeEach(() => {
    pickDashboardMock.mockReset().mockResolvedValue("picked");
  });

  test("uses --dashboard, prompts without it, and fails under --silent", async () => {
    const { resolveDashboardID } = await import("./widget-lookup.js");
    const resources = makeAccount() as never;

    expect(await resolveDashboardID(resources, { dashboard: "given" })).toBe("given");
    expect(await resolveDashboardID(resources, {})).toBe("picked");
    await expect(resolveDashboardID(resources, { silent: true })).rejects.toThrow(/missing_input/);
  });
});

describe("resolveWidgetID", () => {
  let resources: ReturnType<typeof makeAccount>;

  beforeEach(() => {
    resources = makeAccount();
    resources.dashboards.info.mockResolvedValue({ arrangement: [{ widget_id: "w1" }, { widget_id: "w2" }] });
    listDashboardWidgetsMock.mockReset().mockResolvedValue([
      { id: "w1", label: "w1", type: "display" },
      { id: "w2", label: "w2", type: "iframe" },
    ]);
  });

  test("offers only the dashboard's custom widgets", async () => {
    prompts.inject(["w2"]);
    const { resolveWidgetID } = await import("./widget-lookup.js");

    expect(await resolveWidgetID(resources as never, transport, "d1", undefined, {})).toBe("w2");
  });

  test("a dashboard without custom widgets says so", async () => {
    listDashboardWidgetsMock.mockResolvedValue([{ id: "w1", label: "x", type: "display" }]);
    const { resolveWidgetID } = await import("./widget-lookup.js");

    await expect(resolveWidgetID(resources as never, transport, "d1", undefined, {})).rejects.toThrow(/has no custom widgets/);
  });

  test("--silent without a widget ID fails", async () => {
    const { resolveWidgetID } = await import("./widget-lookup.js");

    await expect(resolveWidgetID(resources as never, transport, "d1", undefined, { silent: true })).rejects.toThrow(/missing_input/);
  });

  test("a failed widget listing reports list_failed", async () => {
    listDashboardWidgetsMock.mockRejectedValue(new Error("Too many requests to the API; wait a minute and try again."));
    const { resolveWidgetID } = await import("./widget-lookup.js");

    await expect(resolveWidgetID(resources as never, transport, "d1", undefined, {})).rejects.toThrow(/list_failed: Too many requests/);
  });
});
