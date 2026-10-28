import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();
const listDashboardWidgetsMock = vi.fn();
const listWidgetFoldersMock = vi.fn();
const upsertMock = vi.fn();
const replaceMock = vi.fn();
const promptsMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("prompts", () => ({ default: (...args: unknown[]) => promptsMock(...args) }));

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
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../lib/resolve-scope.js", () => ({
  requireLocalScope: () => ({ scope: "local", root: "/repo" }),
}));

vi.mock("../../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("../../lib/custom-widget-transport.js", () => ({
  listDashboardWidgets: listDashboardWidgetsMock,
}));

vi.mock("./widget-config.js", () => ({
  listWidgetFolders: listWidgetFoldersMock,
  upsertWidgetEntries: upsertMock,
  replaceDashboardEntries: replaceMock,
  resolveEnvironmentName: (environment: string | undefined) => environment ?? "dev",
  widgetPathOf: () => "./widgets",
}));

const D1 = "6ae1f21478169f000cc15bcb";
const D2 = "6a9203c73f568a000c11ed97";
const D9 = "6a9203dcb1ccff000c42391a";
const W1 = "6ae241ed87a406000c4abcea";
const W2 = "6ae1f2314eb7ef000c778410";
const W3 = "6ae1fd4078169f000cc3f313";
const DASHBOARD_WIDGETS = [
  { id: W1, label: "Customer List", type: "iframe" },
  { id: W2, label: "Compressors", type: "iframe" },
  { id: "6ae1fd4078169f000cc3f399", label: "Gauge", type: "angular" },
];

function promptAnswers(...answers: Record<string, unknown>[]) {
  for (const answer of answers) {
    promptsMock.mockResolvedValueOnce(answer);
  }
}

beforeEach(() => {
  resourcesInstance = makeAccount();
  getEnvironmentConfigMock.mockReset().mockReturnValue({ ...makeEnvironmentConfig(), widgetList: [] });
  listDashboardWidgetsMock.mockReset().mockResolvedValue(DASHBOARD_WIDGETS);
  listWidgetFoldersMock.mockReset().mockReturnValue(["alerts", "customer-table"]);
  upsertMock.mockReset().mockReturnValue(true);
  replaceMock.mockReset().mockReturnValue(true);
  promptsMock.mockReset();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("widgetLink with a folder, --dashboard and --widget", () => {
  test("links each custom widget after one dashboard request, once per repeated ID", async () => {
    const { widgetLink } = await import("./widget-link.js");
    await widgetLink("customer-table", { dashboard: D1, widget: [W1, W2, W1], json: true });

    expect(listDashboardWidgetsMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledWith("dev", [
      { folder: "customer-table", dashboard_id: D1, widget_id: W1 },
      { folder: "customer-table", dashboard_id: D1, widget_id: W2 },
    ]);
    const written = JSON.parse(String(vi.mocked(process.stdout.write).mock.calls[0][0]));
    expect(written.linked[0]).toEqual({ folder: "customer-table", dashboard_id: D1, widget_id: W1, label: "Customer List" });
    expect(written.removed).toEqual([]);
  });

  test.each([
    [["6ae241ed87a406000c4abcff"], /not_found: Widget 6ae241ed87a406000c4abcff is not on dashboard/],
    [[W1, "6ae1fd4078169f000cc3f399"], /not_custom_widget: .* is a "angular" widget/],
  ])("a widget that cannot be linked fails and writes nothing", async (widget, message) => {
    const { widgetLink } = await import("./widget-link.js");

    await expect(widgetLink("customer-table", { dashboard: D1, widget })).rejects.toThrow(message);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("a folder without App.tsx names the closest one before any request", async () => {
    const { widgetLink } = await import("./widget-link.js");

    await expect(widgetLink("customer-tabel", { dashboard: D1, widget: [W1] })).rejects.toThrow(
      /folder_not_found: No App.tsx in widgets\/customer-tabel. Did you mean "customer-table"\?/,
    );
    expect(listDashboardWidgetsMock).not.toHaveBeenCalled();
  });

  test("a folder name with a path fails before any request", async () => {
    const { widgetLink } = await import("./widget-link.js");

    await expect(widgetLink("../outside", { dashboard: D1, widget: [W1] })).rejects.toThrow(/not a widget folder name/);
  });

  test.each([
    [undefined, { silent: true }],
    ["customer-table", {}],
    ["customer-table", { dashboard: D1 }],
  ])("missing input fails without prompting (%s)", async (folder, options) => {
    const { widgetLink } = await import("./widget-link.js");

    await expect(widgetLink(folder, options)).rejects.toThrow(/missing_input/);
    expect(promptsMock).not.toHaveBeenCalled();
  });

  test("an environment missing from tagoconfig.json is reported, not a success", async () => {
    upsertMock.mockReturnValue(false);
    const { widgetLink } = await import("./widget-link.js");

    await expect(widgetLink("customer-table", { dashboard: D1, widget: [W1] })).rejects.toThrow(/env_not_found/);
  });
});

describe("widgetLink interactive", () => {
  beforeEach(() => {
    resourcesInstance.dashboards.list.mockResolvedValue([
      { id: D1, label: "QA Customer Overview" },
      { id: D2, label: "Customers" },
    ]);
  });

  test("replaces the chosen dashboards' entries and leaves other dashboards alone", async () => {
    const current = [
      { folder: "alerts", dashboard_id: D1, widget_id: W2 },
      { folder: "alerts", dashboard_id: D9, widget_id: W3 },
    ];
    getEnvironmentConfigMock.mockReturnValue({ ...makeEnvironmentConfig(), widgetList: current });
    listDashboardWidgetsMock.mockImplementation(async (_context: unknown, dashboardID: string) => (dashboardID === D1 ? DASHBOARD_WIDGETS : []));
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers(
      {
        dashboards: [
          { id: D1, label: "QA Customer Overview" },
          { id: D2, label: "Customers" },
        ],
      },
      { widgets: [{ dashboard: { id: D1, label: "QA Customer Overview" }, widget: DASHBOARD_WIDGETS[0] }] },
      { folder: "customer-table" },
      { confirmation: true },
    );

    await widgetLink(undefined, { json: true });

    expect(replaceMock).toHaveBeenCalledWith("dev", [D1, D2], [{ folder: "customer-table", dashboard_id: D1, widget_id: W1 }]);
    const written = JSON.parse(String(vi.mocked(process.stdout.write).mock.calls[0][0]));
    // W2 was on a chosen dashboard and left unchecked; W3 is on a dashboard that was not chosen.
    expect(written.removed).toEqual([current[0]]);
  });

  test("the dashboard and widget pickers offer only custom widgets, with the linked ones checked", async () => {
    getEnvironmentConfigMock.mockReturnValue({ ...makeEnvironmentConfig(), widgetList: [{ folder: "alerts", dashboard_id: D1, widget_id: W2 }] });
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers({ dashboards: [{ id: D1, label: "QA Customer Overview" }] }, { widgets: [] }, { confirmation: true });

    await widgetLink(undefined, {});

    const dashboardChoices = promptsMock.mock.calls[0][0].choices;
    expect(dashboardChoices.map((choice: { selected: boolean }) => choice.selected)).toEqual([true, false]);
    const widgetChoices = promptsMock.mock.calls[1][0].choices;
    expect(widgetChoices.map((choice: { title: string; selected: boolean }) => [choice.title, choice.selected])).toEqual([
      [`QA Customer Overview › Customer List [${W1}]`, false],
      [`QA Customer Overview › Compressors [${W2}]`, true],
    ]);
    // Unchecking everything unlinks the dashboard's widgets.
    expect(replaceMock).toHaveBeenCalledWith("dev", [D1], []);
  });

  test("Skip leaves a checked widget unlinked", async () => {
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers(
      { dashboards: [{ id: D1, label: "QA Customer Overview" }] },
      { widgets: [{ dashboard: { id: D1, label: "QA Customer Overview" }, widget: DASHBOARD_WIDGETS[0] }] },
      { folder: "> skip" },
    );

    await widgetLink(undefined, {});

    expect(replaceMock).toHaveBeenCalledWith("dev", [D1], []);
  });

  test("declining the unlink confirmation writes nothing", async () => {
    getEnvironmentConfigMock.mockReturnValue({ ...makeEnvironmentConfig(), widgetList: [{ folder: "alerts", dashboard_id: D1, widget_id: W2 }] });
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers({ dashboards: [{ id: D1, label: "QA Customer Overview" }] }, { widgets: [] }, { confirmation: false });

    await expect(widgetLink(undefined, {})).rejects.toThrow(/cancelled/);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("Enter on a folder filter that matches nothing asks again instead of cancelling", async () => {
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers(
      { dashboards: [{ id: D1, label: "QA Customer Overview" }] },
      { widgets: [{ dashboard: { id: D1, label: "QA Customer Overview" }, widget: DASHBOARD_WIDGETS[0] }] },
      {},
      { folder: "customer-table" },
    );

    await widgetLink(undefined, {});

    expect(replaceMock).toHaveBeenCalledWith("dev", [D1], [{ folder: "customer-table", dashboard_id: D1, widget_id: W1 }]);
  });

  test("Ctrl+C on the folder prompt cancels without writing", async () => {
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers(
      { dashboards: [{ id: D1, label: "QA Customer Overview" }] },
      { widgets: [{ dashboard: { id: D1, label: "QA Customer Overview" }, widget: DASHBOARD_WIDGETS[0] }] },
    );
    promptsMock.mockImplementationOnce(async (_question: unknown, options: { onCancel: () => void }) => {
      options.onCancel();
      return {};
    });

    await expect(widgetLink(undefined, {})).rejects.toThrow(/cancelled/);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("a cancelled prompt stops before anything is written", async () => {
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers({ dashboards: [{ id: D1, label: "QA Customer Overview" }] }, {});

    await expect(widgetLink(undefined, {})).rejects.toThrow(/cancelled/);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("dashboards without custom widgets fail before the widget prompt", async () => {
    listDashboardWidgetsMock.mockResolvedValue([{ id: W1, label: "Gauge", type: "angular" }]);
    const { widgetLink } = await import("./widget-link.js");
    promptAnswers({ dashboards: [{ id: D1, label: "QA Customer Overview" }] });

    await expect(widgetLink(undefined, {})).rejects.toThrow(/no_widgets/);
    expect(promptsMock).toHaveBeenCalledTimes(1);
  });

  test("no folder with an App.tsx fails before listing dashboards", async () => {
    listWidgetFoldersMock.mockReturnValue([]);
    const { widgetLink } = await import("./widget-link.js");

    await expect(widgetLink(undefined, {})).rejects.toThrow(/no_folders/);
    expect(resourcesInstance.dashboards.list).not.toHaveBeenCalled();
  });
});

describe("listAllDashboards", () => {
  test("pages until a page comes back short", async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ id: String(index), label: `D${index}` }));
    resourcesInstance.dashboards.list.mockResolvedValueOnce(full).mockResolvedValueOnce([{ id: "last", label: "Last" }]);
    const { listAllDashboards } = await import("./widget-link.js");

    expect(await listAllDashboards(resourcesInstance as never)).toHaveLength(101);
    expect(resourcesInstance.dashboards.list.mock.calls.map((call: { page: number }[]) => call[0].page)).toEqual([1, 2]);
  });

  test("stops on a full page with nothing new, so an ignored page cannot loop forever", async () => {
    const full = Array.from({ length: 100 }, (_, index) => ({ id: String(index), label: `D${index}` }));
    resourcesInstance.dashboards.list.mockResolvedValue(full);
    const { listAllDashboards } = await import("./widget-link.js");

    expect(await listAllDashboards(resourcesInstance as never)).toHaveLength(100);
    expect(resourcesInstance.dashboards.list).toHaveBeenCalledTimes(2);
  });
});

describe("toFolderChoices", () => {
  test("puts the linked folder first, then the closest names, then Skip", async () => {
    const { toFolderChoices } = await import("./widget-link.js");

    expect(toFolderChoices(["alerts", "customer-table", "users"], "Customer Table", undefined).map((choice) => choice.title)).toEqual([
      "customer-table",
      expect.any(String),
      expect.any(String),
      "> Skip",
    ]);
    expect(toFolderChoices(["alerts", "customer-table"], "Customer Table", "alerts")[0].title).toBe("alerts");
  });

  /** prompts' autocomplete answers a choice's title when its value is falsy, so Skip needs a truthy value. */
  test("every choice has a truthy value, and Skip's value can never be a folder name", async () => {
    const { toFolderChoices } = await import("./widget-link.js");
    const { isValidWidgetFolder } = await vi.importActual<typeof import("../../lib/widget-build.js")>("../../lib/widget-build.js");
    const choices = toFolderChoices(["alerts"], "Alerts", undefined);

    expect(choices.every((choice) => Boolean(choice.value))).toBe(true);
    expect(isValidWidgetFolder(choices[choices.length - 1].value)).toBe(false);
  });

  test("Skip comes first when the linked folder no longer exists", async () => {
    const { toFolderChoices } = await import("./widget-link.js");

    expect(toFolderChoices(["alerts", "customer-table"], "Customer Table", "deleted-folder")[0].title).toBe("> Skip");
  });
});
