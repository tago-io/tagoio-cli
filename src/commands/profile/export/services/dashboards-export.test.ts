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
  removeAllWidgets: vi.fn(),
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
    tokens: {},
    config: { export_tag: "export_id" },
  });

  test("returns the export_holder after processing a single dashboard with matching tag", async () => {
    account.dashboards.list.mockResolvedValue([
      { id: "dash-1", label: "Dash", tags: [{ key: "export_id", value: "my-dash" }] },
    ]);
    importAccount.dashboards.list.mockResolvedValue([
      { id: "target-dash", label: "Dash", tags: [{ key: "export_id", value: "my-dash" }] },
    ]);
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
    const holder = makeHolder();
    const result = await dashboardExport(
      account as never,
      importAccount as never,
      holder,
      { from: "a", to: "b", entity: [], setup: "" },
    );
    expect(result).toBe(holder);
  });
});
