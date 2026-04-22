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

describe("restoreDictionaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("returns zero counts when no dictionaries are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreDictionaries } = await import("./dictionaries.js");
    const result = await restoreDictionaries({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new and edits existing dictionaries with languages", async () => {
    readBackupFileMock.mockReturnValue([
      {
        id: "d-new",
        name: "New Dict",
        slug: "new",
        fallback: "en",
        languages: [{ dictionary: "d-new", code: "en", data: { hi: "hi" }, active: true }],
      },
      {
        id: "d-exists",
        name: "Existing Dict",
        slug: "ex",
        fallback: "en",
      },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "d-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue({ dictionary: "d-created" });
    const languageEditMock = vi.fn().mockResolvedValue(undefined);
    const resources = {
      dictionaries: { list: listMock, edit: editMock, create: createMock, languageEdit: languageEditMock },
    };

    const { restoreDictionaries } = await import("./dictionaries.js");
    const promise = restoreDictionaries(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(createMock).toHaveBeenCalled();
    expect(editMock).toHaveBeenCalled();
    expect(languageEditMock).toHaveBeenCalledWith("d-created", "en", {
      dictionary: { hi: "hi" },
      active: true,
    });
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when create throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "d-boom", name: "Boom", slug: "b", fallback: "en" }]);

    const resources = {
      dictionaries: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
        edit: vi.fn(),
        languageEdit: vi.fn(),
      },
    };

    const { restoreDictionaries } = await import("./dictionaries.js");
    const promise = restoreDictionaries(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
