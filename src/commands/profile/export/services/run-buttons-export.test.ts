import { beforeEach, describe, expect, test, vi } from "vitest";

import exportHolder from "./mock/exportHolder.json" with { type: "json" };
import runInfo from "./mock/run.json" with { type: "json" };
import targetRunInfo from "./mock/targetRun.json" with { type: "json" };

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: vi.fn(),
}));

vi.mock("./export-backup/export-backup.js", () => ({
  storeExportBackup: vi.fn(),
}));

describe("run-buttons-export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("updateSigninButtons rewrites urls using export holder", async () => {
    const { updateSigninButtons } = await import("./run-buttons-export.js");
    const copyTargetRun = structuredClone(targetRunInfo);
    expect(copyTargetRun.signin_buttons.length).toBe(0);
    expect(runInfo.signin_buttons[0].url).toBe(
      "originTest.run.tago.io/dashboards/info/6387b32e5b570000112303fe?anonymousToken=00000000-6386-4535-8ccb-e400205c3058",
    );
    updateSigninButtons(runInfo as never, copyTargetRun as never, exportHolder as never);

    expect(copyTargetRun.signin_buttons.length).toBe(1);
    // @ts-expect-error type are different after update
    expect(copyTargetRun.signin_buttons[0].url).toBe(
      "resultTest.run.tago.io/dashboards/info/73656d1df7cb62001163c3de?anonymousToken=00000000-7386-4535-8ccb-e400205c3051",
    );
  });

  test("updateSideBarButtons remaps dashboard value ids", async () => {
    const { updateSideBarButtons } = await import("./run-buttons-export.js");
    const copyTargetRun = structuredClone(targetRunInfo);
    expect(copyTargetRun.sidebar_buttons.length).toBe(0);
    updateSideBarButtons(runInfo as never, copyTargetRun as never, exportHolder as never);

    expect(copyTargetRun.sidebar_buttons.length).toBe(2);
    // @ts-expect-error types are different after update
    expect(copyTargetRun.sidebar_buttons[0].value).toBe("7324b541bd887900183227b2");
    // @ts-expect-error types are different after update
    expect(copyTargetRun.sidebar_buttons[1].value).toBe("7324b554218476001907b74d");
  });

  test("runButtonsExport pulls run info from both accounts and calls edit", async () => {
    const runInfoMock = vi.fn().mockResolvedValueOnce(structuredClone(runInfo)).mockResolvedValueOnce(structuredClone(targetRunInfo));
    const editMock = vi.fn().mockResolvedValue(undefined);

    const account = { run: { info: runInfoMock } } as never;
    const importAccount = {
      run: {
        info: () => runInfoMock(),
        edit: editMock,
      },
    } as never;

    const holder = structuredClone(exportHolder) as never;

    const { runButtonsExport } = await import("./run-buttons-export.js");
    const result = await runButtonsExport(account, importAccount, holder);

    expect(editMock).toHaveBeenCalled();
    expect(result).toBe(holder);
  });
});
