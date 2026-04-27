import { describe, expect, test, vi } from "vitest";

const readBackupSingleFileMock = vi.fn();

vi.mock("../lib.js", () => ({
  readBackupSingleFile: readBackupSingleFileMock,
  getErrorMessage: (e: unknown) => String(e),
}));

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: vi.fn(),
  highlightMSG: (s: unknown) => String(s),
}));

describe("restoreRun", () => {
  test("returns zero counts when run data is missing from backup", async () => {
    readBackupSingleFileMock.mockReturnValue(null);

    const { restoreRun } = await import("./run.js");
    const result = await restoreRun({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("increments updated on successful edit", async () => {
    readBackupSingleFileMock.mockReturnValue({ name: "My Run", created_at: "2026-01-01" });
    const editMock = vi.fn().mockResolvedValue(undefined);
    const resources = { run: { edit: editMock } };

    const { restoreRun } = await import("./run.js");
    const result = await restoreRun(resources as never, "/tmp/extract");

    expect(editMock).toHaveBeenCalledWith({ name: "My Run" });
    expect(result).toEqual({ created: 0, updated: 1, failed: 0 });
  });

  test("increments failed when edit throws", async () => {
    readBackupSingleFileMock.mockReturnValue({ name: "My Run", created_at: "2026-01-01" });
    const resources = { run: { edit: vi.fn().mockRejectedValue(new Error("boom")) } };

    const { restoreRun } = await import("./run.js");
    const result = await restoreRun(resources as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
