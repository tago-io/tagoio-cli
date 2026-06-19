import { beforeEach, describe, expect, test, vi } from "vitest";

import type { IExportHolder } from "../types.js";

vi.mock("../../../../lib/messages.js", () => ({
  errorHandler: vi.fn(),
}));

vi.mock("../../../../lib/replace-obj.js", () => ({
  replaceObj: (obj: unknown) => obj,
}));

vi.mock("./export-backup/export-backup.js", () => ({
  storeExportBackup: vi.fn(),
}));

describe("widgets-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("insertWidgets copies widgets from export to import account", async () => {
    const widgetInfoMock = vi.fn().mockResolvedValue({
      id: "w-1",
      data: [{ qty: "10" }],
    });
    const widgetCreateMock = vi.fn().mockResolvedValue({ widget: "w-new" });
    const dashboardEditMock = vi.fn().mockResolvedValue(undefined);

    const exportAccount = {
      dashboards: { widgets: { info: widgetInfoMock } },
    } as never;
    const importAccount = {
      dashboards: { widgets: { create: widgetCreateMock }, edit: dashboardEditMock },
    } as never;

    const dashboard = {
      id: "dash-1",
      label: "Dash",
      arrangement: [{ widget_id: "w-1", tab: "tab-1" }],
      tabs: [{ key: "tab-1", type: "" }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder, false);
    await vi.runAllTimersAsync();
    await promise;

    expect(widgetInfoMock).toHaveBeenCalledWith("dash-1", "w-1");
    expect(widgetCreateMock).toHaveBeenCalled();
    expect(dashboardEditMock).toHaveBeenCalledWith("dash-target", expect.objectContaining({ arrangement: expect.any(Array) }));
  });

  test("removeAllWidgets deletes each widget in arrangement", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const importAccount = {
      dashboards: { widgets: { delete: deleteMock } },
    } as never;

    const dashboard = {
      id: "d",
      arrangement: [{ widget_id: "w1" }, { widget_id: "w2" }],
    };

    const { removeAllWidgets } = await import("./widgets-export.js");
    const promise = removeAllWidgets(importAccount, dashboard as never, false);
    await vi.runAllTimersAsync();
    await promise;
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });

  test("removeAllWidgets keeps iframe widgets and returns them when ignoreCustomWidgets is true", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const infoMock = vi.fn((_dashId: string, widgetId: string) => Promise.resolve({ id: widgetId, type: widgetId === "w-iframe" ? "iframe" : "display" }));
    const importAccount = {
      dashboards: { widgets: { delete: deleteMock, info: infoMock } },
    } as never;

    const dashboard = {
      id: "d",
      arrangement: [
        { widget_id: "w-iframe", tab: "tab-1", x: 0, y: 0, width: 4, height: 4 },
        { widget_id: "w-display", tab: "tab-1", x: 4, y: 0, width: 4, height: 4 },
      ],
    };

    const { removeAllWidgets } = await import("./widgets-export.js");
    const promise = removeAllWidgets(importAccount, dashboard as never, true);
    await vi.runAllTimersAsync();
    const kept = await promise;

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith("d", "w-display");
    expect(kept).toEqual([{ widget_id: "w-iframe", tab: "tab-1", x: 0, y: 0, width: 4, height: 4 }]);
  });

  test("removeAllWidgets returns early when arrangement is empty", async () => {
    const deleteMock = vi.fn();
    const importAccount = {
      dashboards: { widgets: { delete: deleteMock } },
    } as never;

    const { removeAllWidgets } = await import("./widgets-export.js");
    await removeAllWidgets(importAccount, { id: "d", arrangement: [] } as never, false);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  test("insertWidgets skips arrangement entries whose widget was not fetched", async () => {
    const widgetInfoMock = vi.fn().mockResolvedValue(null);
    const widgetCreateMock = vi.fn();
    const dashboardEditMock = vi.fn().mockResolvedValue(undefined);

    const exportAccount = {
      dashboards: { widgets: { info: widgetInfoMock } },
    } as never;
    const importAccount = {
      dashboards: { widgets: { create: widgetCreateMock }, edit: dashboardEditMock },
    } as never;

    const dashboard = {
      id: "dash-1",
      label: "Dash",
      arrangement: [{ widget_id: "ghost", tab: "tab-1" }],
      tabs: [{ key: "tab-1", type: "" }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder, false);
    await vi.runAllTimersAsync();
    await promise;

    expect(widgetCreateMock).not.toHaveBeenCalled();
    expect(dashboardEditMock).toHaveBeenCalledWith("dash-target", { arrangement: [] });
  });

  test("insertWidgets creates hidden-tab widgets before visible-tab widgets", async () => {
    const widgetInfoMock = vi.fn((_dashId: string, widgetId: string) => Promise.resolve({ id: widgetId }));
    const createdOrder: string[] = [];
    const widgetCreateMock = vi.fn((_targetId: string, widget: { id: string }) => {
      createdOrder.push(widget.id);
      return Promise.resolve({ widget: `${widget.id}-new` });
    });
    const dashboardEditMock = vi.fn().mockResolvedValue(undefined);

    const exportAccount = { dashboards: { widgets: { info: widgetInfoMock } } } as never;
    const importAccount = {
      dashboards: { widgets: { create: widgetCreateMock }, edit: dashboardEditMock },
    } as never;

    const dashboard = {
      id: "dash-1",
      label: "Dash",
      arrangement: [
        { widget_id: "w-visible", tab: "tab-visible" },
        { widget_id: "w-hidden", tab: "tab-hidden" },
      ],
      tabs: [
        { key: "tab-visible", type: "" },
        { key: "tab-hidden", type: "hidden" },
      ],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder, false);
    await vi.runAllTimersAsync();
    await promise;

    // The hidden-tab widget must be created first so header-button references resolve.
    expect(createdOrder).toEqual(["w-hidden", "w-visible"]);
  });

  test("insertWidgets preserves widgets without a data array", async () => {
    const widgetInfoMock = vi.fn().mockResolvedValue({ id: "w-1" });
    const widgetCreateMock = vi.fn().mockResolvedValue({ widget: "w-new" });
    const dashboardEditMock = vi.fn().mockResolvedValue(undefined);

    const exportAccount = { dashboards: { widgets: { info: widgetInfoMock } } } as never;
    const importAccount = {
      dashboards: { widgets: { create: widgetCreateMock }, edit: dashboardEditMock },
    } as never;

    const dashboard = {
      id: "dash-1",
      label: "Dash",
      arrangement: [{ widget_id: "w-1", tab: "tab-1" }],
      tabs: [{ key: "tab-1", type: "" }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder, false);
    await vi.runAllTimersAsync();
    await promise;

    expect(widgetCreateMock).toHaveBeenCalled();
  });

  test("insertWidgets preserves the target iframe with the source geometry when ignoreCustomWidgets is true", async () => {
    const widgetInfoMock = vi.fn((_dashId: string, widgetId: string) =>
      Promise.resolve({ id: widgetId, type: widgetId === "w-iframe" ? "iframe" : "display" }),
    );
    const createdIds: string[] = [];
    const widgetCreateMock = vi.fn((_targetId: string, widget: { id: string }) => {
      createdIds.push(widget.id);
      return Promise.resolve({ widget: `${widget.id}-new` });
    });
    const dashboardEditMock = vi.fn().mockResolvedValue(undefined);

    const exportAccount = { dashboards: { widgets: { info: widgetInfoMock } } } as never;
    const importAccount = {
      dashboards: { widgets: { create: widgetCreateMock }, edit: dashboardEditMock },
    } as never;

    const dashboard = {
      id: "dash-1",
      label: "Dash",
      arrangement: [
        { widget_id: "w-iframe", tab: "tab-1", x: 2, y: 3, width: 6, height: 5 },
        { widget_id: "w-display", tab: "tab-1", x: 0, y: 0, width: 4, height: 4 },
      ],
      tabs: [{ key: "tab-1", type: "" }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;
    // The kept target iframe entry uses the TARGET widget id but the source geometry should win.
    const keptIframes = [{ widget_id: "target-iframe", tab: "tab-1", x: 99, y: 99, width: 1, height: 1 }];

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder, true, keptIframes as never);
    await vi.runAllTimersAsync();
    await promise;

    // The iframe is not recreated, only the display is.
    expect(createdIds).toEqual(["w-display"]);
    // Arrangement keeps the target iframe id but the source position/size.
    expect(dashboardEditMock).toHaveBeenCalledWith("dash-target", {
      arrangement: [
        { widget_id: "target-iframe", tab: "tab-1", x: 2, y: 3, width: 6, height: 5 },
        { widget_id: "w-display-new", tab: "tab-1", x: 0, y: 0, width: 4, height: 4 },
      ],
    });
  });

  test("insertWidgets re-attaches kept iframes that have no source match", async () => {
    const widgetInfoMock = vi.fn((_dashId: string, widgetId: string) => Promise.resolve({ id: widgetId, type: "display" }));
    const widgetCreateMock = vi.fn((_targetId: string, widget: { id: string }) => Promise.resolve({ widget: `${widget.id}-new` }));
    const dashboardEditMock = vi.fn().mockResolvedValue(undefined);

    const exportAccount = { dashboards: { widgets: { info: widgetInfoMock } } } as never;
    const importAccount = {
      dashboards: { widgets: { create: widgetCreateMock }, edit: dashboardEditMock },
    } as never;

    // Source has only a display widget; the target keeps an extra iframe the source no longer has.
    const dashboard = {
      id: "dash-1",
      label: "Dash",
      arrangement: [{ widget_id: "w-display", tab: "tab-1", x: 0, y: 0, width: 4, height: 4 }],
      tabs: [{ key: "tab-1", type: "" }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;
    const keptIframes = [{ widget_id: "orphan-iframe", tab: "tab-1", x: 8, y: 0, width: 4, height: 4 }];

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder, true, keptIframes as never);
    await vi.runAllTimersAsync();
    await promise;

    // The orphaned kept iframe is appended with its own geometry so it is not lost.
    expect(dashboardEditMock).toHaveBeenCalledWith("dash-target", {
      arrangement: [
        { widget_id: "w-display-new", tab: "tab-1", x: 0, y: 0, width: 4, height: 4 },
        { widget_id: "orphan-iframe", tab: "tab-1", x: 8, y: 0, width: 4, height: 4 },
      ],
    });
  });

  test("insertWidgets exports iframe widgets when ignoreCustomWidgets is false", async () => {
    const widgetInfoMock = vi.fn((_dashId: string, widgetId: string) =>
      Promise.resolve({ id: widgetId, type: widgetId === "w-iframe" ? "iframe" : "display" }),
    );
    const createdIds: string[] = [];
    const widgetCreateMock = vi.fn((_targetId: string, widget: { id: string }) => {
      createdIds.push(widget.id);
      return Promise.resolve({ widget: `${widget.id}-new` });
    });
    const dashboardEditMock = vi.fn().mockResolvedValue(undefined);

    const exportAccount = { dashboards: { widgets: { info: widgetInfoMock } } } as never;
    const importAccount = {
      dashboards: { widgets: { create: widgetCreateMock }, edit: dashboardEditMock },
    } as never;

    const dashboard = {
      id: "dash-1",
      label: "Dash",
      arrangement: [
        { widget_id: "w-iframe", tab: "tab-1" },
        { widget_id: "w-display", tab: "tab-1" },
      ],
      tabs: [{ key: "tab-1", type: "" }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder, false);
    await vi.runAllTimersAsync();
    await promise;

    expect(createdIds).toEqual(["w-iframe", "w-display"]);
  });

  test("_sortHiddenWidgetsFirst orders hidden-tab widgets first (real org-management dashboard)", async () => {
    const tabs = [
      { key: "IujZ8pqDeqGR9wiAVYnqB", type: "" },
      { key: "DWCnrWQFhX9Q7pFnLn_ct", type: "" },
      { key: "lX97Kjts9qumnoOcA7G7Q", type: "" },
      { key: "zZoK_1AQCt-iQiI29Yl7e", type: "hidden" },
    ];
    const arrangement = [
      { tab: "IujZ8pqDeqGR9wiAVYnqB", widget_id: "6a32b0f1d3f020000ca5c208" },
      { tab: "DWCnrWQFhX9Q7pFnLn_ct", widget_id: "6a32b0f3d5cee5000c54b207" },
      { tab: "lX97Kjts9qumnoOcA7G7Q", widget_id: "6a32b0f4c4325f000c7358cc" },
      { tab: "zZoK_1AQCt-iQiI29Yl7e", widget_id: "6a32b0f2c4325f000c735866" },
      { tab: "zZoK_1AQCt-iQiI29Yl7e", widget_id: "6a32b0f2bf4706000c01817b" },
    ];

    const { _sortHiddenWidgetsFirst } = await import("./widgets-export.js");
    const sorted = _sortHiddenWidgetsFirst(arrangement, tabs);

    expect(sorted.slice(0, 2).map((x) => x.widget_id)).toEqual(["6a32b0f2c4325f000c735866", "6a32b0f2bf4706000c01817b"]);
  });

  test("_sortHiddenWidgetsFirst does not mutate the original arrangement", async () => {
    const tabs = [
      { key: "tab-visible", type: "" },
      { key: "tab-hidden", type: "hidden" },
    ];
    const arrangement = [
      { widget_id: "w-visible", tab: "tab-visible" },
      { widget_id: "w-hidden", tab: "tab-hidden" },
    ];
    const original = [...arrangement];

    const { _sortHiddenWidgetsFirst } = await import("./widgets-export.js");
    _sortHiddenWidgetsFirst(arrangement, tabs);

    expect(arrangement).toEqual(original);
  });
});
