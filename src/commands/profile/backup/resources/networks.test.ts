import { beforeEach, describe, expect, test, vi } from "vitest";

const readBackupFileMock = vi.fn();
const selectItemsFromBackupMock = vi.fn();

vi.mock("../lib.js", () => ({
  readBackupFile: readBackupFileMock,
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

describe("restoreNetworks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns zero counts when no networks are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreNetworks } = await import("./networks.js");
    const result = await restoreNetworks({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new networks and edits existing ones", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "net-new", name: "New Network", middleware: "m1" },
      { id: "net-exists", name: "Existing Network", middleware: "m2" },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "net-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = {
      integration: { networks: { list: listMock, edit: editMock, create: createMock } },
    };

    const { restoreNetworks } = await import("./networks.js");
    const result = await restoreNetworks(resources as never, "/tmp/extract");

    expect(listMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith({ name: "New Network", middleware: "m1" });
    expect(editMock).toHaveBeenCalledWith("net-exists", { name: "Existing Network", middleware: "m2" });
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when api call throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "net-boom", name: "Boom", middleware: "m" }]);

    const resources = {
      integration: {
        networks: {
          list: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockRejectedValue(new Error("boom")),
          edit: vi.fn(),
        },
      },
    };

    const { restoreNetworks } = await import("./networks.js");
    const result = await restoreNetworks(resources as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });

  test("returns early when granular selection is empty", async () => {
    readBackupFileMock.mockReturnValue([{ id: "n-1", name: "One" }]);
    selectItemsFromBackupMock.mockResolvedValue([]);

    const { restoreNetworks } = await import("./networks.js");
    const result = await restoreNetworks({} as never, "/tmp/extract", true);
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("restores only the items selected in granular mode", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "n-1", name: "One" },
      { id: "n-2", name: "Two" },
    ]);
    selectItemsFromBackupMock.mockResolvedValue([{ id: "n-1", name: "One" }]);

    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = {
      integration: { networks: { list: vi.fn().mockResolvedValue([]), create: createMock, edit: vi.fn() } },
    };

    const { restoreNetworks } = await import("./networks.js");
    const result = await restoreNetworks(resources as never, "/tmp/extract", true);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
  });
});
