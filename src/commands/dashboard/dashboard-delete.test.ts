import prompts from "prompts";
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

const removeDashboardEntriesMock = vi.fn();

vi.mock("../../lib/resolve-scope.js", () => ({
  resolveScope: () => ({ scope: "local", root: "/repo" }),
}));

vi.mock("../widgets/widget-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../widgets/widget-config.js")>()),
  removeDashboardEntries: removeDashboardEntriesMock,
}));

describe("dashboardDelete", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.dashboards.info.mockResolvedValue({ id: "d1", label: "Fleet", arrangement: [{ widget_id: "w1" }, { widget_id: "w2" }] });
    resourcesInstance.dashboards.delete.mockResolvedValue("Successfully Removed");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("declining the confirmation makes no delete call", async () => {
    prompts.inject([false]);
    const { dashboardDelete } = await import("./dashboard-delete.js");
    await dashboardDelete("d1", {});

    expect(resourcesInstance.dashboards.delete).not.toHaveBeenCalled();
  });

  test("-y deletes without asking and --json reports it", async () => {
    const { dashboardDelete } = await import("./dashboard-delete.js");
    await dashboardDelete("d1", { yes: true, json: true });

    expect(resourcesInstance.dashboards.delete).toHaveBeenCalledWith("d1");
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toEqual({ id: "d1", deleted: true });
  });

  test("drops the deleted dashboard's widgets from widgetList", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ widgetList: [{ folder: "users-summary", dashboard_id: "d1", widget_id: "w1" }] }));
    const { dashboardDelete } = await import("./dashboard-delete.js");
    await dashboardDelete("d1", { yes: true, environment: "dev" });

    expect(removeDashboardEntriesMock).toHaveBeenCalledWith("dev", "d1");
  });

  test("the confirmation names how many widgets go with the dashboard", async () => {
    const { buildDeleteMessage, describeTarget } = await import("./dashboard-delete.js");
    const scope = await describeTarget(resourcesInstance as never, "d1");

    expect(buildDeleteMessage(scope.label, scope.widgets)).toBe('Permanently delete dashboard "Fleet"? Its 2 widgets go with it.');
  });
});
