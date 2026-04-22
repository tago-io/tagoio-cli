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

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
  };
});

describe("restoreAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("returns zero counts when no analysis are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreAnalysis } = await import("./analysis.js");
    const result = await restoreAnalysis({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new and edits existing analyses (no script on disk)", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "an-new", name: "New Analysis", runtime: "node" },
      { id: "an-exists", name: "Existing Analysis", runtime: "node" },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "an-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue({ id: "an-created" });
    const uploadScriptMock = vi.fn();
    const resources = {
      analysis: { list: listMock, edit: editMock, create: createMock, uploadScript: uploadScriptMock },
    };

    const { restoreAnalysis } = await import("./analysis.js");
    const promise = restoreAnalysis(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(createMock).toHaveBeenCalled();
    expect(editMock).toHaveBeenCalled();
    expect(uploadScriptMock).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when create throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "an-boom", name: "Boom", runtime: "node" }]);

    const resources = {
      analysis: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
        edit: vi.fn(),
        uploadScript: vi.fn(),
      },
    };

    const { restoreAnalysis } = await import("./analysis.js");
    const promise = restoreAnalysis(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
