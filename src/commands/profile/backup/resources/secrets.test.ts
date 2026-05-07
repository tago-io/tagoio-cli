import { beforeEach, describe, expect, test, vi } from "vitest";

const readBackupFileMock = vi.fn();
const selectItemsFromBackupMock = vi.fn();

vi.mock("../lib.js", () => ({
  readBackupFile: readBackupFileMock,
  selectItemsFromBackup: (...args: unknown[]) => selectItemsFromBackupMock(...args),
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

describe("restoreSecrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("returns zero counts when no secrets are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreSecrets } = await import("./secrets.js");
    const result = await restoreSecrets({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new secrets and skips existing ones", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "s-new", key: "NEW_KEY", value: "v1", tags: [] },
      { id: "s-exists", key: "EXISTING_KEY", value: "v2", tags: [] },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "s-exists", key: "EXISTING_KEY" }]);
    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = { secrets: { list: listMock, create: createMock } };

    const { restoreSecrets } = await import("./secrets.js");
    const promise = restoreSecrets(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(createMock).toHaveBeenCalledWith({ key: "NEW_KEY", value: "v1", tags: [] });
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when create throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "s-boom", key: "BOOM", value: "v", tags: [] }]);

    const resources = {
      secrets: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
      },
    };

    const { restoreSecrets } = await import("./secrets.js");
    const promise = restoreSecrets(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });

  test("returns early when granular selection is empty", async () => {
    readBackupFileMock.mockReturnValue([{ id: "s-1", key: "K1", value: "v", tags: [] }]);
    selectItemsFromBackupMock.mockResolvedValue([]);

    const { restoreSecrets } = await import("./secrets.js");
    const promise = restoreSecrets({} as never, "/tmp/extract", true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("restores only the items selected in granular mode", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "s-1", key: "K1", value: "v1", tags: [] },
      { id: "s-2", key: "K2", value: "v2", tags: [] },
    ]);
    selectItemsFromBackupMock.mockResolvedValue([{ id: "s-1", key: "K1", value: "v1", tags: [] }]);

    const createMock = vi.fn().mockResolvedValue(undefined);
    const resources = { secrets: { list: vi.fn().mockResolvedValue([]), create: createMock } };

    const { restoreSecrets } = await import("./secrets.js");
    const promise = restoreSecrets(resources as never, "/tmp/extract", true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
  });
});
