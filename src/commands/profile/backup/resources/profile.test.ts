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

describe("restoreProfile", () => {
  test("returns zero counts when no profile data is in backup", async () => {
    readBackupSingleFileMock.mockReturnValue(null);

    const { restoreProfile } = await import("./profile.js");
    const result = await restoreProfile({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("updates an existing profile when the ID already exists", async () => {
    readBackupSingleFileMock.mockReturnValue({
      id: "prof-1",
      name: "P",
      account: "a",
      logo_url: null,
      banner_url: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      resource_allocation: {
        analysis: 1, data_records: 2, sms: 3, email: 4, run_users: 5, push_notification: 6, file_storage: 7,
      },
    });
    const editMock = vi.fn().mockResolvedValue(undefined);
    const listMock = vi.fn().mockResolvedValue([{ id: "prof-1" }]);
    const resources = { profiles: { edit: editMock, list: listMock, create: vi.fn() } };

    const { restoreProfile } = await import("./profile.js");
    const result = await restoreProfile(resources as never, "/tmp/extract");

    expect(editMock).toHaveBeenCalledWith("prof-1", expect.any(Object));
    expect(result).toEqual({ created: 0, updated: 1, failed: 0 });
  });

  test("creates a new profile when the ID is not present", async () => {
    readBackupSingleFileMock.mockReturnValue({
      id: "new-prof",
      name: "NewProf",
      account: "a",
      logo_url: null,
      banner_url: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
      resource_allocation: {
        analysis: 0, data_records: 0, sms: 0, email: 0, run_users: 0, push_notification: 0, file_storage: 0,
      },
    });
    const createMock = vi.fn().mockResolvedValue({ id: "created-id" });
    const editMock = vi.fn().mockResolvedValue(undefined);
    const listMock = vi.fn().mockResolvedValue([]);
    const resources = { profiles: { create: createMock, edit: editMock, list: listMock } };

    const { restoreProfile } = await import("./profile.js");
    const result = await restoreProfile(resources as never, "/tmp/extract");

    expect(createMock).toHaveBeenCalledWith({ name: "NewProf" });
    expect(editMock).toHaveBeenCalledWith("created-id", expect.any(Object));
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
  });
});
