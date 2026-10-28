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

describe("dashboardList", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.dashboards.list.mockResolvedValue([
      { id: "d1", label: "Fleet", type: "blueprint", visible: true, tags: [{ key: "team", value: "ops" }] },
    ]);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("filters by partial label and tags", async () => {
    const { dashboardList } = await import("./dashboard-list.js");
    await dashboardList({ name: "fle", tagkey: ["team"], tagvalue: ["ops"], json: true });

    const query = resourcesInstance.dashboards.list.mock.calls[0][0];
    expect(query.filter).toEqual({ label: "*fle*", tags: [{ key: "team", value: "ops" }] });
  });

  test("an unknown --order-by fails before any call", async () => {
    const { dashboardList } = await import("./dashboard-list.js");

    await expect(dashboardList({ orderBy: "type" })).rejects.toThrow(/invalid_order_by/);
    expect(resourcesInstance.dashboards.list).not.toHaveBeenCalled();
  });

  test("--json keeps the tag list and reports the type", async () => {
    const { dashboardList } = await import("./dashboard-list.js");
    await dashboardList({ json: true });

    const [row] = JSON.parse(String(stdoutSpy.mock.calls[0][0]));
    expect(row).toMatchObject({ id: "d1", type: "blueprint", tags: [{ key: "team", value: "ops" }] });
  });
});
