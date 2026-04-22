import { beforeEach, describe, expect, test, vi } from "vitest";

const readBackupFileMock = vi.fn();

vi.mock("../lib.js", () => ({
  readBackupFile: readBackupFileMock,
  selectItemsFromBackup: vi.fn(),
  getErrorMessage: (e: unknown) => String(e),
}));

vi.mock("../../../../lib/messages.js", () => ({
  errorHandler: vi.fn(),
  infoMSG: vi.fn(),
  highlightMSG: (s: unknown) => String(s),
}));

vi.mock("ora", () => ({
  default: () => ({
    start: () => ({ text: "", succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

describe("restoreDashboards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("returns zero counts when no dashboards are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreDashboards } = await import("./dashboards.js");
    const result = await restoreDashboards({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new dashboard with widgets and edits existing dashboard", async () => {
    readBackupFileMock.mockReturnValue([
      {
        id: "dash-new",
        label: "New Dashboard",
        arrangement: [{ widget_id: "w-old", x: 0, y: 0 }],
        widgets: [{ id: "w-old", dashboard: "dash-new", type: "display" }],
      },
      {
        id: "dash-exists",
        label: "Existing Dashboard",
        arrangement: [],
        widgets: [{ id: "w-existing", dashboard: "dash-exists", type: "display" }],
      },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "dash-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue({ dashboard: "dash-created" });
    const widgetCreateMock = vi.fn().mockResolvedValue({ widget: "w-new" });
    const widgetEditMock = vi.fn().mockResolvedValue(undefined);
    const resources = {
      dashboards: {
        list: listMock,
        edit: editMock,
        create: createMock,
        widgets: { create: widgetCreateMock, edit: widgetEditMock },
      },
    };

    const { restoreDashboards } = await import("./dashboards.js");
    const promise = restoreDashboards(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(createMock).toHaveBeenCalled();
    expect(widgetCreateMock).toHaveBeenCalled();
    expect(widgetEditMock).toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when create throws", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "dash-boom", label: "Boom", arrangement: [], widgets: [] },
    ]);

    const resources = {
      dashboards: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
        edit: vi.fn(),
        widgets: { create: vi.fn(), edit: vi.fn() },
      },
    };

    const { restoreDashboards } = await import("./dashboards.js");
    const promise = restoreDashboards(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
