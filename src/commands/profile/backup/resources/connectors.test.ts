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

describe("restoreConnectors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns zero counts when no connectors are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreConnectors } = await import("./connectors.js");
    const result = await restoreConnectors({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new and edits existing connectors", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "c-new", name: "New Connector" },
      { id: "c-exists", name: "Existing Connector" },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "c-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = {
      integration: { connectors: { list: listMock, edit: editMock, create: createMock } },
    };

    const { restoreConnectors } = await import("./connectors.js");
    const result = await restoreConnectors(resources as never, "/tmp/extract");

    expect(createMock).toHaveBeenCalled();
    expect(editMock).toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when api call throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "c-boom", name: "Boom" }]);

    const resources = {
      integration: {
        connectors: {
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockRejectedValue(new Error("boom")),
          edit: vi.fn(),
        },
      },
    };

    const { restoreConnectors } = await import("./connectors.js");
    const result = await restoreConnectors(resources as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
