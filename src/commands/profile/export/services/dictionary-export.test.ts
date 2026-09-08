import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import type { IExportHolder } from "../types.js";

vi.mock("../../../../lib/messages.js", () => ({
  errorHandler: vi.fn(),
  infoMSG: vi.fn(),
}));

describe("dictionaryExport", () => {
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

  test("returns the export_holder after processing a single dictionary", async () => {
    account.dictionaries.list.mockResolvedValue([
      { id: "dict-1", slug: "MENU", name: "Menu", languages: [] },
    ]);
    importAccount.dictionaries.list.mockResolvedValue([
      { id: "target-dict", slug: "MENU", name: "Menu", languages: [] },
    ]);

    const { dictionaryExport } = await import("./dictionary-export.js");
    const holder = makeHolder();
    const result = await dictionaryExport(account as never, importAccount as never, holder);
    expect(result).toBe(holder);
  });

  test("creates dictionaries when no matching slug exists in the import account", async () => {
    account.dictionaries.list.mockResolvedValue([
      { id: "dict-1", slug: "MENU", name: "Menu", languages: [{ code: "en" }] },
    ]);
    importAccount.dictionaries.list.mockResolvedValue([]);
    importAccount.dictionaries.create.mockResolvedValue({ dictionary: "new-dict" });
    account.dictionaries.languageInfo.mockResolvedValue({ home: "Home" });
    importAccount.dictionaries.languageEdit.mockResolvedValue(undefined);

    const { dictionaryExport } = await import("./dictionary-export.js");
    await dictionaryExport(account as never, importAccount as never, makeHolder());

    expect(importAccount.dictionaries.create).toHaveBeenCalled();
    expect(importAccount.dictionaries.languageEdit).toHaveBeenCalledWith("new-dict", "en", expect.any(Object));
  });

  test("edits existing dictionary when a matching slug is found", async () => {
    account.dictionaries.list.mockResolvedValue([
      { id: "dict-1", slug: "MENU", name: "Menu", languages: [{ code: "en" }] },
    ]);
    importAccount.dictionaries.list.mockResolvedValue([
      { id: "target-dict", slug: "MENU", name: "Menu", languages: [] },
    ]);
    account.dictionaries.languageInfo.mockResolvedValue({ home: "Home" });
    importAccount.dictionaries.languageEdit.mockResolvedValue(undefined);

    const { dictionaryExport } = await import("./dictionary-export.js");
    await dictionaryExport(account as never, importAccount as never, makeHolder());

    expect(importAccount.dictionaries.edit).toHaveBeenCalledWith("target-dict", expect.any(Object));
    expect(importAccount.dictionaries.create).not.toHaveBeenCalled();
  });
});
