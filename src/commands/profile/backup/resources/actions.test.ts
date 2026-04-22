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

describe("restoreActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns zero counts when no actions are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreActions } = await import("./actions.js");
    const result = await restoreActions({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new and edits existing actions", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "a-new", name: "New Action", type: "trigger" },
      { id: "a-exists", name: "Existing Action", type: "trigger" },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "a-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = { actions: { list: listMock, edit: editMock, create: createMock } };

    const { restoreActions } = await import("./actions.js");
    const result = await restoreActions(resources as never, "/tmp/extract");

    expect(createMock).toHaveBeenCalled();
    expect(editMock).toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when api call throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "a-boom", name: "Boom", type: "trigger" }]);

    const resources = {
      actions: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
        edit: vi.fn(),
      },
    };

    const { restoreActions } = await import("./actions.js");
    const result = await restoreActions(resources as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
