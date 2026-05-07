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
      tabs: [{ key: "tab-1", hidden: false }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder);
    await vi.runAllTimersAsync();
    await promise;

    expect(widgetInfoMock).toHaveBeenCalledWith("dash-1", "w-1");
    expect(widgetCreateMock).toHaveBeenCalled();
    expect(dashboardEditMock).toHaveBeenCalledWith(
      "dash-target",
      expect.objectContaining({ arrangement: expect.any(Array) })
    );
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
    const promise = removeAllWidgets(importAccount, dashboard as never);
    await vi.runAllTimersAsync();
    await promise;
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });

  test("removeAllWidgets returns early when arrangement is empty", async () => {
    const deleteMock = vi.fn();
    const importAccount = {
      dashboards: { widgets: { delete: deleteMock } },
    } as never;

    const { removeAllWidgets } = await import("./widgets-export.js");
    await removeAllWidgets(importAccount, { id: "d", arrangement: [] } as never);
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
      tabs: [{ key: "tab-1", hidden: false }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder);
    await vi.runAllTimersAsync();
    await promise;

    expect(widgetCreateMock).not.toHaveBeenCalled();
    expect(dashboardEditMock).toHaveBeenCalledWith("dash-target", { arrangement: [] });
  });

  test("insertWidgets sorts hidden tabs to the end of the arrangement", async () => {
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
      arrangement: [
        { widget_id: "w-1", tab: "tab-hidden" },
        { widget_id: "w-2", tab: "tab-visible" },
      ],
      tabs: [
        { key: "tab-hidden", hidden: true },
        { key: "tab-visible", hidden: false },
      ],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder);
    await vi.runAllTimersAsync();
    await promise;

    expect(widgetInfoMock).toHaveBeenCalled();
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
      tabs: [{ key: "tab-1", hidden: false }],
    };
    const target = { id: "dash-target" };
    const holder: IExportHolder = { analysis: {}, devices: {}, networks: {}, connectors: {}, dashboards: {} } as never;

    const { insertWidgets } = await import("./widgets-export.js");
    const promise = insertWidgets(exportAccount, importAccount, dashboard as never, target as never, holder);
    await vi.runAllTimersAsync();
    await promise;

    expect(widgetCreateMock).toHaveBeenCalled();
  });
});
