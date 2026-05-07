import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock, makeFetchResponse } from "../test-utils/mock-fetch.js";
import { updater, updaterUtils } from "./notify-update.js";

describe("updaterUtils", () => {
  describe("isUpdateAvailable", () => {
    test("returns true when current version is behind latest", () => {
      expect(updaterUtils.isUpdateAvailable("1.0.0", "1.0.1")).toBe(true);
    });

    test("returns false when current version equals latest", () => {
      expect(updaterUtils.isUpdateAvailable("1.0.0", "1.0.0")).toBe(false);
    });

    test("returns false when current version is ahead of latest (pre-release or local build)", () => {
      expect(updaterUtils.isUpdateAvailable("1.0.1", "1.0.0")).toBe(false);
    });
  });

  describe("fetch", () => {
    test("returns parsed JSON when the response is ok", async () => {
      const fetchMock = installFetchMock();
      fetchMock.mockResolvedValue(makeFetchResponse({ version: "1.2.3" }));

      const result = await updaterUtils.fetch("https://registry.npmjs.org/@tago-io/cli/latest");
      expect(result).toEqual({ version: "1.2.3" });
    });

    test("throws when the response is not ok", async () => {
      const fetchMock = installFetchMock();
      fetchMock.mockResolvedValue(makeFetchResponse({}, { ok: false, status: 500 }));

      await expect(updaterUtils.fetch("https://registry.npmjs.org/x")).rejects.toThrow(/Request failed/);
    });
  });

  describe("getLatestVersion", () => {
    test("returns the version string from the registry", async () => {
      const fetchMock = installFetchMock();
      fetchMock.mockResolvedValue(makeFetchResponse({ version: "4.5.6" }));

      const result = await updaterUtils.getLatestVersion("@tago-io/cli");
      expect(result).toBe("4.5.6");
    });
  });

  describe("notify", () => {
    test("returns a function that writes the available-update message to stderr (clig.dev: status -> stderr)", () => {
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const log = updaterUtils.notify("@tago-io/cli", "1.0.0", "2.0.0");

      log();

      expect(stderrSpy).toHaveBeenCalledOnce();
      const output = String(stderrSpy.mock.calls[0][0]);
      expect(output).toContain("@tago-io/cli");
      expect(output).toContain("1.0.0");
      expect(output).toContain("2.0.0");

      stderrSpy.mockRestore();
    });
  });
});

describe("updater", () => {
  let getLatestVersionSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getLatestVersionSpy = vi.spyOn(updaterUtils, "getLatestVersion");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns a silent no-op when the latest version lookup fails", async () => {
    getLatestVersionSpy.mockRejectedValue(new Error("network down"));

    const log = await updater({ name: "@tago-io/cli", version: "1.0.0" });
    expect(log()).toBeNull();
  });

  test("returns a silent no-op when no update is available", async () => {
    getLatestVersionSpy.mockResolvedValue("1.0.0" as never);

    const log = await updater({ name: "@tago-io/cli", version: "1.0.0" });
    expect(log()).toBeNull();
  });

  test("returns a notifier function when an update is available", async () => {
    getLatestVersionSpy.mockResolvedValue("2.0.0" as never);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const log = await updater({ name: "@tago-io/cli", version: "1.0.0" });
    log();

    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = String(stderrSpy.mock.calls[0][0]);
    expect(output).toContain("1.0.0");
    expect(output).toContain("2.0.0");
  });
});
