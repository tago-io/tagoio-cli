import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import type { IExportHolder } from "../types.js";

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: vi.fn(),
}));

describe("accessExport", () => {
  let account: ReturnType<typeof makeAccount>;
  let importAccount: ReturnType<typeof makeAccount>;

  beforeEach(() => {
    account = makeAccount();
    importAccount = makeAccount();
  });

  const makeHolder = (): IExportHolder => ({
    devices: { "dev-src": "dev-tgt" },
    analysis: {},
    dashboards: {},
    tokens: {},
    config: { export_tag: "export_id" },
  });

  test("returns the export_holder unchanged when both lists are empty", async () => {
    account.accessManagement.list.mockResolvedValue([]);
    importAccount.accessManagement.list.mockResolvedValue([]);

    const { accessExport } = await import("./access-export.js");
    const holder = makeHolder();
    const result = await accessExport(account as never, importAccount as never, holder);
    expect(result).toBe(holder);
  });

  test("creates a new access rule when no matching target exists", async () => {
    account.accessManagement.list.mockResolvedValue([
      { id: "acc-1", name: "Access One", tags: [{ key: "export_id", value: "my-access" }] },
    ]);
    importAccount.accessManagement.list.mockResolvedValue([]);
    account.accessManagement.info.mockResolvedValue({
      id: "acc-1",
      name: "Access One",
      tags: [{ key: "export_id", value: "my-access" }],
      permissions: [],
    });
    importAccount.accessManagement.create.mockResolvedValue({ am_id: "new-acc-id" });

    const { accessExport } = await import("./access-export.js");
    await accessExport(account as never, importAccount as never, makeHolder());

    expect(importAccount.accessManagement.create).toHaveBeenCalled();
    expect(importAccount.accessManagement.edit).not.toHaveBeenCalled();
  });

  test("edits an existing access rule when a matching target tag is found", async () => {
    account.accessManagement.list.mockResolvedValue([
      { id: "acc-1", name: "Access One", tags: [{ key: "export_id", value: "my-access" }] },
    ]);
    importAccount.accessManagement.list.mockResolvedValue([
      { id: "target-acc", tags: [{ key: "export_id", value: "my-access" }] },
    ]);
    account.accessManagement.info.mockResolvedValue({
      id: "acc-1",
      name: "Access One",
      tags: [{ key: "export_id", value: "my-access" }],
    });

    const { accessExport } = await import("./access-export.js");
    await accessExport(account as never, importAccount as never, makeHolder());

    expect(importAccount.accessManagement.edit).toHaveBeenCalledWith("target-acc", expect.any(Object));
    expect(importAccount.accessManagement.create).not.toHaveBeenCalled();
  });
});
