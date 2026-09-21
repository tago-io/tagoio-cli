import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import type { IExportHolder } from "../types.js";

vi.mock("../../../../lib/messages.js", () => ({
  errorHandler: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../../../prompt/choose-from-list.js", () => ({
  chooseFromList: vi.fn(),
}));

vi.mock("./export-backup/export-backup.js", () => ({
  storeExportBackup: vi.fn(),
}));

vi.mock("./widgets-export.js", () => ({
  insertWidgets: vi.fn(),
  removeAllWidgets: vi.fn().mockResolvedValue([]),
}));

describe("dashboardExport", () => {
  let account: ReturnType<typeof makeAccount>;
  let importAccount: ReturnType<typeof makeAccount>;

  beforeEach(() => {
    account = makeAccount();
    importAccount = makeAccount();
  });

  const makeHolder = (): IExportHolder => ({
    devices: {},
    analysis: {},
    dashboards: {},
    secrets: {},
    tokens: {},
    config: { export_tag: "export_id" },
  });

  test("returns the export_holder after processing a single dashboard with matching tag", async () => {
    account.dashboards.list.mockResolvedValue([{ id: "dash-1", label: "Dash", tags: [{ key: "export_id", value: "my-dash" }] }]);
    importAccount.dashboards.list.mockResolvedValue([{ id: "target-dash", label: "Dash", tags: [{ key: "export_id", value: "my-dash" }] }]);
    account.dashboards.info.mockResolvedValue({
      id: "dash-1",
      label: "Dash",
      tags: [{ key: "export_id", value: "my-dash" }],
      arrangement: [],
      tabs: [],
    });
    importAccount.dashboards.info.mockResolvedValue({
      id: "target-dash",
      label: "Dash",
      tags: [{ key: "export_id", value: "my-dash" }],
      arrangement: [],
      tabs: [],
    });
    importAccount.dashboards.edit.mockResolvedValue(undefined);

    const { dashboardExport } = await import("./dashboards-export.js");
    const { removeAllWidgets, insertWidgets } = await import("./widgets-export.js");
    const holder = makeHolder();
    const result = await dashboardExport(account as never, importAccount as never, holder, {
      from: "a",
      to: "b",
      entity: [],
      setup: "",
      ignoreCustomWidgets: true,
    });
    expect(result).toBe(holder);
    // removeAllWidgets receives the flag and its returned kept array is threaded into insertWidgets.
    expect(removeAllWidgets).toHaveBeenCalledWith(expect.anything(), expect.anything(), true);
    expect(insertWidgets).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), true, []);
  });

  test("creates a new dashboard when the import list has no match", async () => {
    account.dashboards.list.mockResolvedValue([{ id: "dash-1", label: "Dash", tags: [{ key: "export_id", value: "only-in-source" }] }]);
    importAccount.dashboards.list.mockResolvedValue([]);
    account.dashboards.info.mockResolvedValue({
      id: "dash-1",
      label: "Dash",
      tags: [{ key: "export_id", value: "only-in-source" }],
      arrangement: [],
      tabs: [],
    });
    importAccount.dashboards.create.mockResolvedValue({ dashboard: "new-dash" });
    importAccount.dashboards.info.mockResolvedValue({
      id: "new-dash",
      label: "Dash",
      tags: [],
      arrangement: [],
      tabs: [],
    });
    importAccount.dashboards.edit.mockResolvedValue(undefined);

    vi.useFakeTimers();
    const { dashboardExport } = await import("./dashboards-export.js");
    const holder = makeHolder();
    const promise = dashboardExport(account as never, importAccount as never, holder, { from: "a", to: "b", entity: [], setup: "" });
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(importAccount.dashboards.create).toHaveBeenCalled();
    expect(result).toBe(holder);
  });

  test("skips dashboards without the export tag", async () => {
    account.dashboards.list.mockResolvedValue([{ id: "dash-1", label: "Dash", tags: [{ key: "other", value: "x" }] }]);
    importAccount.dashboards.list.mockResolvedValue([]);
    account.dashboards.info.mockResolvedValue({
      id: "dash-1",
      label: "Dash",
      tags: [{ key: "other", value: "x" }],
      arrangement: [],
      tabs: [],
    });

    const { dashboardExport } = await import("./dashboards-export.js");
    const holder = makeHolder();
    await dashboardExport(account as never, importAccount as never, holder, { from: "a", to: "b", entity: [], setup: "" });
    expect(importAccount.dashboards.create).not.toHaveBeenCalled();
    expect(holder.dashboards).toEqual({});
  });

  test("calls chooseFromList when options.pick is true", async () => {
    const sourceItem = { id: "dash-1", label: "Dash", tags: [{ key: "export_id", value: "v" }] };
    account.dashboards.list.mockResolvedValue([sourceItem]);
    importAccount.dashboards.list.mockResolvedValue([]);

    // choose returns the same single item so the queue has work and drains properly
    const { chooseFromList } = await import("../../../../prompt/choose-from-list.js");
    (chooseFromList as ReturnType<typeof vi.fn>).mockResolvedValue([sourceItem]);
    account.dashboards.info.mockResolvedValue({
      id: "dash-1",
      label: "Dash",
      tags: [{ key: "export_id", value: "v" }],
      arrangement: [],
      tabs: [],
    });
    importAccount.dashboards.create.mockResolvedValue({ dashboard: "new-dash" });
    importAccount.dashboards.info.mockResolvedValue({
      id: "new-dash",
      label: "Dash",
      tags: [],
      arrangement: [],
      tabs: [],
    });
    importAccount.dashboards.edit.mockResolvedValue(undefined);

    vi.useFakeTimers();
    const { dashboardExport } = await import("./dashboards-export.js");
    const holder = makeHolder();
    const promise = dashboardExport(account as never, importAccount as never, holder, { from: "a", to: "b", entity: [], setup: "", pick: true });
    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(chooseFromList).toHaveBeenCalled();
  });
});
