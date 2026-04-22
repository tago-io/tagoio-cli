import { beforeEach, describe, expect, test, vi } from "vitest";

const readBackupFileMock = vi.fn();

vi.mock("../lib.js", () => ({
  readBackupFile: readBackupFileMock,
  selectItemsFromBackup: vi.fn(),
  getErrorMessage: (e: unknown) => String(e),
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

describe("restoreAccessManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns zero counts when no policies are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreAccessManagement } = await import("./access-management.js");
    const result = await restoreAccessManagement({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new and edits existing policies", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "p-new", name: "New Policy" },
      { id: "p-exists", name: "Existing Policy" },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "p-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = { accessManagement: { list: listMock, edit: editMock, create: createMock } };

    const { restoreAccessManagement } = await import("./access-management.js");
    const result = await restoreAccessManagement(resources as never, "/tmp/extract");

    expect(createMock).toHaveBeenCalledWith({ name: "New Policy" });
    expect(editMock).toHaveBeenCalledWith("p-exists", { name: "Existing Policy" });
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when api call throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "p-boom", name: "Boom" }]);

    const resources = {
      accessManagement: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
        edit: vi.fn(),
      },
    };

    const { restoreAccessManagement } = await import("./access-management.js");
    const result = await restoreAccessManagement(resources as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
