import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getCurrentFolderMock = vi.fn();

vi.mock("../../../../../lib/get-current-folder.js", () => ({
  getCurrentFolder: () => getCurrentFolderMock(),
}));

describe("storeExportBackup", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "export-backup-"));
    getCurrentFolderMock.mockReturnValue(tmpRoot);
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("returns silently when json is falsy", async () => {
    const { storeExportBackup } = await import("./export-backup.js");
    await expect(storeExportBackup("original", "devices", undefined)).resolves.toBeUndefined();
  });

  test("writes an entity JSON file keyed by id under the source/entity path", async () => {
    const { storeExportBackup } = await import("./export-backup.js");
    const json = { id: "dev-1", name: "Device" };
    await storeExportBackup("original", "devices", json);

    const filePath = join(tmpRoot, "exportBackup", "original", "devices", "dev-1.json");
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(content).toEqual(json);
  });

  test("writes widgets under dashboards/<dashboard>/widgets/", async () => {
    const { storeExportBackup } = await import("./export-backup.js");
    const json = { id: "w-1", dashboard: "dash-1" };
    await storeExportBackup("target", "widgets", json);

    const filePath = join(tmpRoot, "exportBackup", "target", "dashboards", "dash-1", "widgets", "w-1.json");
    expect(() => readFileSync(filePath, "utf-8")).not.toThrow();
  });

  test("falls back to name when id is missing", async () => {
    const { storeExportBackup } = await import("./export-backup.js");
    await storeExportBackup("original", "actions", { name: "My Action" });

    const filePath = join(tmpRoot, "exportBackup", "original", "actions", "myaction.json");
    expect(() => readFileSync(filePath, "utf-8")).not.toThrow();
  });
});
