import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const deployEntriesMock = vi.fn();
const buildFolderMock = vi.fn();
const addWidgetEntryMock = vi.fn();
let projectRoot: string;

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
  getApiURL: () => "https://api.us-e1.tago.io",
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
  requireOrFail: async (value: string | undefined) => value,
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../lib/resolve-scope.js", () => ({
  requireLocalScope: () => ({ scope: "local", root: projectRoot }),
}));

vi.mock("./widget-deploy.js", () => ({
  buildFolder: buildFolderMock,
  deployEntries: deployEntriesMock,
}));

vi.mock("./widget-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./widget-config.js")>()),
  addWidgetEntry: addWidgetEntryMock,
}));

const D = "6a68b4f5e4b1e5000b5ab1ef";

describe("widgetCreate", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "widget-create-"));
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    deployEntriesMock.mockReset().mockResolvedValue([{ status: "deployed" }]);
    buildFolderMock.mockReset().mockResolvedValue({ source: "export default App;", outFile: "/x.tsx", bytes: 19 });
    addWidgetEntryMock.mockReset();
    resourcesInstance.dashboards.info.mockResolvedValue({
      id: D,
      tabs: [
        { key: "main", value: "Main" },
        { key: "other", value: "Other" },
      ],
      arrangement: [{ widget_id: "old", x: 0, y: 0, width: 4, height: 3, tab: "main" }],
    });
    resourcesInstance.dashboards.widgets.create.mockResolvedValue({ widget: "6ae0000000000000000000aa" });
    resourcesInstance.dashboards.edit.mockResolvedValue("Successfully Updated");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("creates a custom widget with its parameters, data, filters and analysis", async () => {
    const { widgetCreate } = await import("./widget-create.js");
    await widgetCreate("Sensors", {
      dashboard: D,
      param: ["view_type=viewer"],
      data: '[{"origin":"6a91f697b1ccff000c3eb271","variables":["temperature"]}]',
      maxData: 2500,
      deviceFilter: '[{"id":"g1","filters":[{"tag_key":"device_type","tag_value":"sensor"}],"data":[{"type":"parameter","parameter":"name"}]}]',
      analysis: "6adf6f3f12f2ac000cb16d2c",
    });

    const body = resourcesInstance.dashboards.widgets.create.mock.calls[0][1];
    expect(body).toMatchObject({
      label: "Sensors",
      type: "iframe",
      display: { url: "", parameters: [{ key: "view_type", value: "viewer" }], max_data: 2500, resource_options: { device: { groups: [{ id: "g1" }] } } },
      data: [{ origin: "6a91f697b1ccff000c3eb271", variables: ["temperature"] }],
      resource: [{ type: "device", filter: [{ key: "device_type", value: "sensor" }], view: ["name"] }],
      analysis_run: "6adf6f3f12f2ac000cb16d2c",
    });
  });

  test("an entity data source goes into resource next to the filters' entries", async () => {
    const { widgetCreate } = await import("./widget-create.js");
    await widgetCreate("Maintenance", {
      dashboard: D,
      userFilter: '[{"filters":[{"tag_key":"mock","tag_value":"true"}],"data":[{"type":"parameter","parameter":"name"}]}]',
      entitySource: '[{"id":"6ae1f21478169f000cc15bcc","view":["compressor","cost"]}]',
    });

    const body = resourcesInstance.dashboards.widgets.create.mock.calls[0][1];
    expect(body.resource.map((entry: { type: string }) => entry.type)).toEqual(["user", "entity"]);
    expect(body.resource[1]).toMatchObject({ id: "6ae1f21478169f000cc15bcc", view: ["compressor", "cost"], index: "id_updated_at_idx" });
  });

  test("an entity source on a device slot fails before the widget is created", async () => {
    resourcesInstance.dashboards.info.mockResolvedValue({
      id: D,
      tabs: [],
      arrangement: [],
      blueprint_devices: [{ id: "6ae1f21478169f000cc15bcc", name: "customer", type: "device" }],
    });
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Maintenance", { dashboard: D, entitySource: '[{"id":"6ae1f21478169f000cc15bcc","view":["notes"]}]' })).rejects.toThrow(
      /invalid_entity_source.*"customer" slot, which is a device slot/,
    );
    expect(resourcesInstance.dashboards.widgets.create).not.toHaveBeenCalled();
  });

  test("places it below the first tab's widgets and sends the full arrangement back", async () => {
    const { widgetCreate } = await import("./widget-create.js");
    await widgetCreate("Sensors", { dashboard: D });

    expect(resourcesInstance.dashboards.edit).toHaveBeenCalledWith(D, {
      arrangement: [
        { widget_id: "old", x: 0, y: 0, width: 4, height: 3, tab: "main" },
        { widget_id: "6ae0000000000000000000aa", x: 0, y: 3, width: 4, height: 6, tab: "main" },
      ],
    });
  });

  test("an unknown tab fails before the widget is created", async () => {
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Sensors", { dashboard: D, tab: "map" })).rejects.toThrow(/invalid_tab.*Use one of: main, other/);
    expect(resourcesInstance.dashboards.widgets.create).not.toHaveBeenCalled();
  });

  test("a malformed filter fails before any call", async () => {
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Sensors", { dashboard: D, userFilter: '[{"filters":[]}]' })).rejects.toThrow(/invalid_filter/);
    expect(resourcesInstance.dashboards.info).not.toHaveBeenCalled();
  });

  test("a failed placement names the widget it created", async () => {
    resourcesInstance.dashboards.edit.mockRejectedValue(new Error("Invalid arrangement"));
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Sensors", { dashboard: D })).rejects.toThrow(
      /placement_failed: Widget 6ae0000000000000000000aa was created but could not be placed/,
    );
  });

  test("--folder without an App.tsx fails before anything is created", async () => {
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Users", { dashboard: D, folder: "users-summary" })).rejects.toThrow(/folder_not_found/);
    expect(resourcesInstance.dashboards.widgets.create).not.toHaveBeenCalled();
  });

  test("--folder registers the widget in widgetList and deploys it", async () => {
    mkdirSync(join(projectRoot, "widgets", "users-summary"), { recursive: true });
    writeFileSync(join(projectRoot, "widgets", "users-summary", "App.tsx"), "export default function App() { return null; }");
    process.env.TAGOIO_DEFAULT = "dev";
    const { widgetCreate } = await import("./widget-create.js");
    await widgetCreate("Users", { dashboard: D, folder: "users-summary", json: true });

    const entry = { folder: "users-summary", dashboard_id: D, widget_id: "6ae0000000000000000000aa" };
    expect(addWidgetEntryMock).toHaveBeenCalledWith("dev", entry);
    expect(deployEntriesMock.mock.calls[0][1]).toEqual([entry]);
    // The source built before the widget existed is the one uploaded.
    expect(deployEntriesMock.mock.calls[0][2].get("users-summary")).toEqual({ source: "export default App;", outFile: "/x.tsx", bytes: 19 });
    expect(buildFolderMock.mock.invocationCallOrder[0]).toBeLessThan(resourcesInstance.dashboards.widgets.create.mock.invocationCallOrder[0]);
    expect(JSON.parse(String(stdoutSpy.mock.calls[0][0]))).toMatchObject({ id: "6ae0000000000000000000aa", folder: "users-summary" });
  });

  test("a folder that does not build creates no widget", async () => {
    mkdirSync(join(projectRoot, "widgets", "users-summary"), { recursive: true });
    writeFileSync(join(projectRoot, "widgets", "users-summary", "App.tsx"), "export default function App() { return null; }");
    buildFolderMock.mockResolvedValue({ error: 'users-summary: "luxon" is imported but not declared' });
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Users", { dashboard: D, folder: "users-summary" })).rejects.toThrow(/build_failed.*luxon.*No widget was created/);
    expect(resourcesInstance.dashboards.widgets.create).not.toHaveBeenCalled();
  });

  test("a folder name that leaves widgetPath is refused", async () => {
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Users", { dashboard: D, folder: "../other" })).rejects.toThrow(/folder_not_found.*not a widget folder name/);
  });

  test("a position outside the 4-column grid fails before any call", async () => {
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Sensors", { dashboard: D, x: 2, width: 3 })).rejects.toThrow(/invalid_position.*4 columns wide/);
    expect(resourcesInstance.dashboards.info).not.toHaveBeenCalled();
  });

  test("a failed deploy after --folder says what was already done", async () => {
    mkdirSync(join(projectRoot, "widgets", "users-summary"), { recursive: true });
    writeFileSync(join(projectRoot, "widgets", "users-summary", "App.tsx"), "export default function App() { return null; }");
    deployEntriesMock.mockResolvedValue([{ status: "build_failed", error: '"luxon" is imported but not declared' }]);
    const { widgetCreate } = await import("./widget-create.js");

    await expect(widgetCreate("Users", { dashboard: D, folder: "users-summary" })).rejects.toThrow(
      /created, placed and added to widgetList, but the deploy failed/,
    );
  });
});
