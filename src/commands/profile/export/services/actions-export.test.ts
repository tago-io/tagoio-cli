import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../../../../test-utils/mock-sdk.js";
import type { IExportHolder } from "../types.js";

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: vi.fn(),
}));

vi.mock("../../../../lib/replace-obj.js", () => ({
  replaceObj: (obj: unknown) => obj,
}));

describe("actionsExport", () => {
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

  test("returns the export_holder unchanged when both lists are empty", async () => {
    account.actions.list.mockResolvedValue([]);
    importAccount.actions.list.mockResolvedValue([]);

    const { actionsExport } = await import("./actions-export.js");
    const holder = makeHolder();
    const result = await actionsExport(account as never, importAccount as never, holder);
    expect(result).toBe(holder);
  });

  test("creates a new action when there is no matching target and cleans empty trigger fields", async () => {
    account.actions.list.mockResolvedValue([
      { id: "act-1", name: "Act One", tags: [{ key: "export_id", value: "my-act" }] },
    ]);
    importAccount.actions.list.mockResolvedValue([]);
    account.actions.info.mockResolvedValue({
      id: "act-1",
      name: "Act One",
      tags: [{ key: "export_id", value: "my-act" }],
      trigger: [
        { value: "", second_value: "", tag_key: "k", unlock: true },
      ],
    });
    importAccount.actions.create.mockResolvedValue({ action: "new-act-id" });

    const { actionsExport } = await import("./actions-export.js");
    await actionsExport(account as never, importAccount as never, makeHolder());

    const createArg = importAccount.actions.create.mock.calls[0][0];
    expect(createArg.trigger[0].value).toBeUndefined();
    expect(createArg.trigger[0].second_value).toBeUndefined();
    expect(createArg.trigger[0].unlock).toBeUndefined();
  }, 10000);

  test("edits an existing action when a matching target is found", async () => {
    account.actions.list.mockResolvedValue([
      { id: "act-1", name: "Act One", tags: [{ key: "export_id", value: "my-act" }] },
    ]);
    importAccount.actions.list.mockResolvedValue([
      { id: "tgt-act", tags: [{ key: "export_id", value: "my-act" }] },
    ]);
    account.actions.info.mockResolvedValue({
      id: "act-1",
      name: "Act One",
      tags: [{ key: "export_id", value: "my-act" }],
      trigger: [{ value: "keep", second_value: "keep", unlock: false }],
    });
    importAccount.actions.edit.mockResolvedValue(undefined);

    const { actionsExport } = await import("./actions-export.js");
    await actionsExport(account as never, importAccount as never, makeHolder());

    expect(importAccount.actions.edit).toHaveBeenCalled();
    const editArg = importAccount.actions.edit.mock.calls[0][1];
    // Trigger fields are kept when truthy
    expect(editArg.trigger[0].value).toBe("keep");
    expect(editArg.trigger[0].second_value).toBe("keep");
  }, 10000);
});
