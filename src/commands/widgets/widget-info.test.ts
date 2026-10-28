import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
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
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
  infoMSG: vi.fn(),
  writeStatus: writeStatusMock,
}));

vi.mock("../../prompt/pick-dashboard-id-from-tagoio.js", () => ({
  pickDashboardIDFromTagoIO: vi.fn(),
}));

const D = "6a68b4f5e4b1e5000b5ab1ef";
const W = "6ad1084c174a0b000cb231a4";

const WIDGET = {
  id: W,
  label: "Users",
  type: "iframe",
  token: "SENTINEL_TOKEN",
  display: {
    url: `https://files.us-e1.tago.io/p/storage/widgets/${W}.tsx`,
    artifact_url: "https://files.us-e1.tago.io/p/storage/widgets/.bundled/x.html",
    parameters: [{ key: "view_type", value: "viewer" }],
    resource_options: {
      user: {
        groups: [
          {
            id: "u1",
            filters: [{ from_blueprint: false, tag_key: "mock", tag_value: "true", blueprint_device: "", blueprint_device_tag_match: "" }],
            data: [{ type: "parameter", parameter: "email", editable: false }],
          },
        ],
      },
    },
  },
  resource: [{ id: "slot1", type: "entity", view: ["name"] }],
};

describe("widgetInfo", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    writeStatusMock.mockClear();
    resourcesInstance.dashboards.widgets.info.mockResolvedValue(WIDGET);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("--json keeps the stored filter groups and drops the token", async () => {
    const { widgetInfo } = await import("./widget-info.js");
    await widgetInfo(W, { dashboard: D, json: true });

    const written = String(stdoutSpy.mock.calls[0][0]);
    expect(written).not.toContain("SENTINEL_TOKEN");
    expect(JSON.parse(written).display.resource_options.user.groups[0].id).toBe("u1");
  });

  test("the human view shows the code state, parameters, filters and other resources", async () => {
    const { widgetInfo } = await import("./widget-info.js");
    await widgetInfo(W, { dashboard: D });

    const lines = writeStatusMock.mock.calls.map(([line]) => String(line));
    expect(lines).toContainEqual(expect.stringContaining("source uploaded; bundled"));
    expect(lines).toContainEqual("  view_type = viewer");
    expect(lines).toContainEqual("  user: mock=true; columns email");
    expect(lines).toContainEqual(`  ${JSON.stringify(WIDGET.resource[0])}`);
  });
});

describe("describeCode", () => {
  test("tells apart no source, a never-bundled source and another widget's file", async () => {
    const { describeCode } = await import("./widget-info.js");

    expect(describeCode({}, W)).toBe("no source uploaded");
    expect(describeCode({ url: `https://x/widgets/${W}.tsx` }, W)).toBe("source uploaded; never bundled successfully");
    expect(describeCode({ url: "https://x/widgets/other.tsx", artifact_url: "a" }, W)).toBe("points at https://x/widgets/other.tsx; bundled");
  });
});
