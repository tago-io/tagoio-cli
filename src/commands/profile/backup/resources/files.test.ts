import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const selectItemsFromBackupMock = vi.fn();

vi.mock("../lib.js", () => ({
  getErrorMessage: (e: unknown) => String(e),
  selectItemsFromBackup: (...args: unknown[]) => selectItemsFromBackupMock(...args),
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

describe("restoreFiles", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "files-restore-"));
    vi.useFakeTimers();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("returns zero counts when the files directory does not exist in backup", async () => {
    const { restoreFiles } = await import("./files.js");
    const result = await restoreFiles({} as never, tmpRoot);
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("uploads each file found under files/ recursively", async () => {
    const filesDir = join(tmpRoot, "files");
    mkdirSync(join(filesDir, "nested"), { recursive: true });
    writeFileSync(join(filesDir, "a.txt"), "alpha");
    writeFileSync(join(filesDir, "nested", "b.txt"), "beta");

    const uploadBase64Mock = vi.fn().mockResolvedValue(undefined);
    const resources = { files: { uploadBase64: uploadBase64Mock } };

    const { restoreFiles } = await import("./files.js");
    const promise = restoreFiles(resources as never, tmpRoot);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(uploadBase64Mock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ created: 2, updated: 0, failed: 0 });
  });

  test("increments failed count when upload throws", async () => {
    const filesDir = join(tmpRoot, "files");
    mkdirSync(filesDir);
    writeFileSync(join(filesDir, "boom.txt"), "boom");

    const resources = {
      files: { uploadBase64: vi.fn().mockRejectedValue(new Error("upload failed")) },
    };

    const { restoreFiles } = await import("./files.js");
    const promise = restoreFiles(resources as never, tmpRoot);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });

  test("returns early when granular selection is empty", async () => {
    const filesDir = join(tmpRoot, "files");
    mkdirSync(filesDir);
    writeFileSync(join(filesDir, "a.txt"), "alpha");
    selectItemsFromBackupMock.mockResolvedValue([]);

    const { restoreFiles } = await import("./files.js");
    const promise = restoreFiles({} as never, tmpRoot, true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("restores only the items selected in granular mode", async () => {
    const filesDir = join(tmpRoot, "files");
    mkdirSync(filesDir);
    writeFileSync(join(filesDir, "a.txt"), "alpha");
    writeFileSync(join(filesDir, "b.txt"), "beta");
    // Mock returns first file only
    selectItemsFromBackupMock.mockImplementation(async (items: unknown[]) => [items[0]]);

    const uploadBase64Mock = vi.fn().mockResolvedValue(undefined);
    const resources = { files: { uploadBase64: uploadBase64Mock } };

    const { restoreFiles } = await import("./files.js");
    const promise = restoreFiles(resources as never, tmpRoot, true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(uploadBase64Mock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
  });
});
