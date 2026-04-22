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

describe("restoreRunUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("returns zero counts when no run users are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreRunUsers } = await import("./run-users.js");
    const result = await restoreRunUsers({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("creates new and edits existing run users", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "u-new", name: "New", email: "new@x.io" },
      { id: "u-exists", name: "Existing", email: "existing@x.io" },
    ]);

    const listUsersMock = vi.fn().mockResolvedValue([{ id: "u-exists", email: "existing@x.io" }]);
    const userEditMock = vi.fn().mockResolvedValue(undefined);
    const userCreateMock = vi.fn().mockResolvedValue(undefined);
    const resources = {
      run: { listUsers: listUsersMock, userEdit: userEditMock, userCreate: userCreateMock },
    };

    const { restoreRunUsers } = await import("./run-users.js");
    const promise = restoreRunUsers(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(userEditMock).toHaveBeenCalledWith("u-exists", expect.objectContaining({ email: "existing@x.io" }));
    expect(userCreateMock).toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when create throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "u-boom", name: "Boom", email: "boom@x.io" }]);

    const resources = {
      run: {
        listUsers: vi.fn().mockResolvedValue([]),
        userCreate: vi.fn().mockRejectedValue(new Error("boom")),
        userEdit: vi.fn(),
      },
    };

    const { restoreRunUsers } = await import("./run-users.js");
    const promise = restoreRunUsers(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });
});
