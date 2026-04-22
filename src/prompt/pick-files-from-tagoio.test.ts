import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeAccount } from "../test-utils/mock-sdk.js";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

describe("pickFileFromTagoIO", () => {
  beforeEach(() => {
    errorHandlerMock.mockClear();
  });

  test("returns the full file URL when the user selects a json file at the root", async () => {
    const account = makeAccount();
    account.files.list.mockResolvedValue({
      folders: [],
      files: [{ filename: "deviceBackup/backup.json" }],
    });
    account.profiles.info.mockResolvedValue({ info: { id: "profile-id" } });

    const { pickFileFromTagoIO } = await import("./pick-files-from-tagoio.js");
    prompts.inject([{ name: "deviceBackup/backup.json", isFolder: false }]);

    await expect(pickFileFromTagoIO(account as never)).resolves.toBe("https://api.tago.io/file/profile-id/deviceBackup/backup.json");
  });

  test("descends into a selected folder and returns the file from the second listing", async () => {
    const account = makeAccount();
    account.files.list
      .mockResolvedValueOnce({ folders: ["sub"], files: [] })
      .mockResolvedValueOnce({ folders: [], files: [{ filename: "deviceBackup/sub/file.json" }] });
    account.profiles.info.mockResolvedValue({ info: { id: "profile-id" } });

    const { pickFileFromTagoIO } = await import("./pick-files-from-tagoio.js");
    prompts.inject([
      { name: "sub", isFolder: true },
      { name: "deviceBackup/sub/file.json", isFolder: false },
    ]);

    await expect(pickFileFromTagoIO(account as never)).resolves.toBe("https://api.tago.io/file/profile-id/deviceBackup/sub/file.json");
  });

  test("returns undefined when the user selects the Cancel entry (empty file name)", async () => {
    const account = makeAccount();
    account.files.list.mockResolvedValue({
      folders: [],
      files: [{ filename: "deviceBackup/a.json" }],
    });

    const { pickFileFromTagoIO } = await import("./pick-files-from-tagoio.js");
    prompts.inject([{ name: "", isFolder: false }]);

    await expect(pickFileFromTagoIO(account as never)).resolves.toBeUndefined();
  });

  test("calls errorHandler when the user cancels the prompt entirely", async () => {
    const account = makeAccount();
    account.files.list.mockResolvedValue({
      folders: [],
      files: [{ filename: "deviceBackup/a.json" }],
    });

    const { pickFileFromTagoIO } = await import("./pick-files-from-tagoio.js");
    prompts.inject([undefined]);

    await expect(pickFileFromTagoIO(account as never)).rejects.toThrow(/Cancelled/);
  });

  test("filters out non-json files from the choices", async () => {
    const account = makeAccount();
    account.files.list.mockResolvedValue({
      folders: [],
      files: [
        { filename: "deviceBackup/a.txt" },
        { filename: "deviceBackup/b.json" },
      ],
    });
    account.profiles.info.mockResolvedValue({ info: { id: "pid" } });

    const { pickFileFromTagoIO } = await import("./pick-files-from-tagoio.js");
    prompts.inject([{ name: "deviceBackup/b.json", isFolder: false }]);

    await expect(pickFileFromTagoIO(account as never)).resolves.toBe("https://api.tago.io/file/pid/deviceBackup/b.json");
  });
});
