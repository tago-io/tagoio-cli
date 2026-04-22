import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchResponse } from "../../../test-utils/mock-fetch.js";

let fetchMock: ReturnType<typeof installFetchMock>;

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

vi.mock("../../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  highlightMSG: (s: unknown) => String(s),
}));

const pickFromListMock = vi.fn();
vi.mock("../../../prompt/pick-from-list.js", () => ({
  pickFromList: (...args: unknown[]) => pickFromListMock(...args),
}));

const promptsMock = vi.fn();
vi.mock("prompts", () => ({ default: (...args: unknown[]) => promptsMock(...args) }));

describe("backup/lib", () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    errorHandlerMock.mockImplementation((str: unknown) => {
      throw new Error(String(str));
    });
    fetchMock = installFetchMock();
    tmpRoot = mkdtempSync(join(tmpdir(), "backup-lib-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("readBackupFile", () => {
    test("returns parsed array when file exists", async () => {
      const resourcesDir = join(tmpRoot, "resources");
      mkdirSync(resourcesDir);
      writeFileSync(join(resourcesDir, "items.json"), JSON.stringify([{ id: "1" }, { id: "2" }]));

      const { readBackupFile } = await import("./lib.js");
      expect(readBackupFile(tmpRoot, "items.json")).toEqual([{ id: "1" }, { id: "2" }]);
    });

    test("returns empty array when file is missing", async () => {
      const { readBackupFile } = await import("./lib.js");
      expect(readBackupFile(tmpRoot, "missing.json")).toEqual([]);
    });
  });

  describe("readBackupSingleFile", () => {
    test("returns parsed object when file exists", async () => {
      const resourcesDir = join(tmpRoot, "resources");
      mkdirSync(resourcesDir);
      writeFileSync(join(resourcesDir, "profile.json"), JSON.stringify({ id: "p" }));

      const { readBackupSingleFile } = await import("./lib.js");
      expect(readBackupSingleFile(tmpRoot, "profile.json")).toEqual({ id: "p" });
    });

    test("returns null when file is missing", async () => {
      const { readBackupSingleFile } = await import("./lib.js");
      expect(readBackupSingleFile(tmpRoot, "missing.json")).toBeNull();
    });
  });

  describe("formatFileSize", () => {
    test("returns dash for falsy bytes", async () => {
      const { formatFileSize } = await import("./lib.js");
      expect(formatFileSize(undefined)).toBe("-");
      expect(formatFileSize(0)).toBe("-");
    });

    test("formats bytes into largest sensible unit", async () => {
      const { formatFileSize } = await import("./lib.js");
      expect(formatFileSize(512)).toBe("512.00 B");
      expect(formatFileSize(2048)).toBe("2.00 KB");
      expect(formatFileSize(1024 * 1024 * 3)).toBe("3.00 MB");
      expect(formatFileSize(1024 * 1024 * 1024 * 2)).toBe("2.00 GB");
    });
  });

  describe("formatDate", () => {
    test("returns formatted date and time", async () => {
      const { formatDate } = await import("./lib.js");
      const result = formatDate("2026-01-15T10:30:00Z");
      expect(typeof result).toBe("string");
      expect(result).toMatch(/\d+.*\d+/);
    });
  });

  describe("getErrorMessage", () => {
    test("handles Error instances", async () => {
      const { getErrorMessage } = await import("./lib.js");
      expect(getErrorMessage(new Error("boom"))).toBe("boom");
    });

    test("handles objects with message property", async () => {
      const { getErrorMessage } = await import("./lib.js");
      expect(getErrorMessage({ message: "oops" })).toBe("oops");
    });

    test("falls back to JSON.stringify for unknown values", async () => {
      const { getErrorMessage } = await import("./lib.js");
      expect(getErrorMessage({ foo: "bar" })).toBe('{"foo":"bar"}');
    });
  });

  describe("handleBackupError", () => {
    test("reports Error message with fallback prefix", async () => {
      const { handleBackupError } = await import("./lib.js");
      expect(() => handleBackupError(new Error("oops"), "fallback")).toThrow("fallback: oops");
    });

    test("reports object message with fallback prefix", async () => {
      const { handleBackupError } = await import("./lib.js");
      expect(() => handleBackupError({ message: "oops" }, "fallback")).toThrow("fallback: oops");
    });

    test("uses fallback when no useful message is available", async () => {
      const { handleBackupError } = await import("./lib.js");
      // getErrorMessage returns JSON string of empty object → falsy check triggers fallback only branch
      expect(() => handleBackupError({}, "fallback msg")).toThrow(/fallback msg/);
    });
  });

  describe("fetchBackups", () => {
    test("returns result array from api response", async () => {
      fetchMock.mockResolvedValue(makeFetchResponse({ result: [{ id: "b1" }, { id: "b2" }] }));

      const { fetchBackups } = await import("./lib.js");
      const result = await fetchBackups("profile-id", "https://api", "token");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api/profile/profile-id/backup?orderBy=created_at,desc",
        { headers: { Authorization: "token" } },
      );
      expect(result).toEqual([{ id: "b1" }, { id: "b2" }]);
    });

    test("returns empty array when result is missing", async () => {
      fetchMock.mockResolvedValue(makeFetchResponse({}));

      const { fetchBackups } = await import("./lib.js");
      const result = await fetchBackups("p", "u", "t");
      expect(result).toEqual([]);
    });
  });

  describe("getDownloadUrl", () => {
    test("returns download url, size, and expiration", async () => {
      fetchMock.mockResolvedValue(
        makeFetchResponse({ result: { url: "https://dl", file_size_mb: "12.5", expire_at: "2026-01-20T00:00:00Z" } }),
      );

      const { getDownloadUrl } = await import("./lib.js");
      const result = await getDownloadUrl("pid", "bid", "https://api", "token", { password: "pw" });

      expect(fetchMock).toHaveBeenCalledWith("https://api/profile/pid/backup/bid/download", {
        method: "POST",
        headers: { Authorization: "token", "Content-Type": "application/json" },
        body: JSON.stringify({ password: "pw" }),
      });
      expect(result).toEqual({ url: "https://dl", fileSizeMb: "12.5", expireAt: "2026-01-20T00:00:00Z" });
    });
  });

  describe("selectBackup", () => {
    test("returns selected backup when user picks one", async () => {
      const backups = [
        { id: "b1", status: "completed", created_at: "2026-01-01T00:00:00Z", file_size: 1024 },
        { id: "b2", status: "running", created_at: "2026-01-02T00:00:00Z", file_size: 2048 },
      ];
      pickFromListMock.mockResolvedValue("b1");

      const { selectBackup } = await import("./lib.js");
      const result = await selectBackup(backups as never, "download");
      expect(result).toEqual(backups[0]);
    });

    test("errors out when no completed backups exist", async () => {
      const { selectBackup } = await import("./lib.js");
      await expect(selectBackup([{ id: "b1", status: "running" }] as never, "download")).rejects.toThrow(
        /No completed backups/
      );
    });

    test("returns null when pick is cancelled", async () => {
      const backups = [{ id: "b1", status: "completed", created_at: "2026-01-01T00:00:00Z", file_size: 100 }];
      pickFromListMock.mockResolvedValue(null);

      const { selectBackup } = await import("./lib.js");
      await expect(selectBackup(backups as never, "download")).rejects.toThrow(/No backup selected/);
    });
  });

  describe("promptCredentials", () => {
    test("returns credentials with otp when 2fa is configured", async () => {
      promptsMock.mockResolvedValueOnce({ password: "pw" }).mockResolvedValueOnce({ pin: "123456" });
      pickFromListMock.mockResolvedValue("authenticator");

      const { promptCredentials } = await import("./lib.js");
      const result = await promptCredentials();
      expect(result).toEqual({ password: "pw", otp_type: "authenticator", pin_code: "123456" });
    });

    test("returns credentials without otp when 2fa is disabled", async () => {
      promptsMock.mockResolvedValueOnce({ password: "pw" });
      pickFromListMock.mockResolvedValue("none");

      const { promptCredentials } = await import("./lib.js");
      const result = await promptCredentials();
      expect(result).toEqual({ password: "pw" });
    });

    test("errors out when password is missing", async () => {
      promptsMock.mockResolvedValueOnce({ password: undefined });
      const { promptCredentials } = await import("./lib.js");
      await expect(promptCredentials()).rejects.toThrow(/Password is required/);
    });
  });

  describe("selectItemsFromBackup", () => {
    test("returns empty array when items list is empty", async () => {
      const { selectItemsFromBackup } = await import("./lib.js");
      const result = await selectItemsFromBackup([], "items");
      expect(result).toEqual([]);
    });

    test("returns filtered items when user selects some", async () => {
      promptsMock.mockResolvedValue({ selected: ["1"] });
      const items = [
        { id: "1", name: "First" },
        { id: "2", name: "Second" },
      ];
      const { selectItemsFromBackup } = await import("./lib.js");
      const result = await selectItemsFromBackup(items, "items");
      expect(result).toEqual([{ id: "1", name: "First" }]);
    });

    test("returns null when user selects nothing", async () => {
      promptsMock.mockResolvedValue({ selected: [] });
      const items = [{ id: "1", name: "x" }];
      const { selectItemsFromBackup } = await import("./lib.js");
      const result = await selectItemsFromBackup(items, "items");
      expect(result).toBeNull();
    });
  });
});
