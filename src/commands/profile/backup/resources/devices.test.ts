import { beforeEach, describe, expect, test, vi } from "vitest";

const readBackupFileMock = vi.fn();
const selectItemsFromBackupMock = vi.fn();

vi.mock("../lib.js", () => ({
  readBackupFile: readBackupFileMock,
  selectItemsFromBackup: (...args: unknown[]) => selectItemsFromBackupMock(...args),
  getErrorMessage: (e: unknown) => String(e),
}));

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: vi.fn(),
  highlightMSG: (s: unknown) => String(s),
}));

vi.mock("ora", () => ({
  default: () => ({
    start: () => ({ text: "", succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

describe("restoreDevices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("returns zero counts when no devices are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreDevices } = await import("./devices.js");
    const result = await restoreDevices({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("splits devices across create and edit queues", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "dev-new", name: "New Device", network: "n1", connector: "c1" },
      { id: "dev-exists", name: "Existing Device", network: "n2", connector: "c2" },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "dev-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = { devices: { list: listMock, edit: editMock, create: createMock } };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(createMock).toHaveBeenCalled();
    expect(editMock).toHaveBeenCalledWith("dev-exists", expect.objectContaining({ name: "Existing Device" }));
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when create throws", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "dev-boom", name: "Boom", network: "n", connector: "c" },
    ]);

    const resources = {
      devices: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
        edit: vi.fn(),
      },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });

  test("returns early when granular selection is empty", async () => {
    readBackupFileMock.mockReturnValue([{ id: "dev-1", name: "One", network: "n", connector: "c" }]);
    selectItemsFromBackupMock.mockResolvedValue([]);

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices({} as never, "/tmp/extract", true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("restores only the items selected in granular mode", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "dev-1", name: "One", network: "n", connector: "c" },
      { id: "dev-2", name: "Two", network: "n", connector: "c" },
    ]);
    selectItemsFromBackupMock.mockResolvedValue([{ id: "dev-1", name: "One", network: "n", connector: "c" }]);

    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = { devices: { list: vi.fn().mockResolvedValue([]), create: createMock, edit: vi.fn() } };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract", true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
  });
});
