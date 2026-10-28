import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const getConfigFileMock = vi.fn();
const writeToConfigFileMock = vi.fn();
const writeConfigFileEnvMock = vi.fn();

vi.mock("../../lib/config-file.js", () => ({
  getConfigFile: getConfigFileMock,
  writeToConfigFile: writeToConfigFileMock,
  writeConfigFileEnv: writeConfigFileEnvMock,
}));

const ENTRY = { folder: "users-summary", dashboard_id: "d1", widget_id: "w1" };

describe("widgetList updates", () => {
  beforeEach(() => {
    getConfigFileMock.mockReset().mockReturnValue({ default: "dev", dev: { id: "p", widgetList: [ENTRY] }, prod: { id: "q" } });
    writeToConfigFileMock.mockReset();
    writeConfigFileEnvMock.mockReset();
  });

  /** writeConfigFileEnv would also make the environment the active default. */
  test("adds an entry without changing the default environment", async () => {
    const { addWidgetEntry } = await import("./widget-config.js");
    addWidgetEntry("prod", { ...ENTRY, widget_id: "w9" });

    expect(writeToConfigFileMock.mock.calls[0][0].prod.widgetList).toEqual([{ ...ENTRY, widget_id: "w9" }]);
    expect(writeConfigFileEnvMock).not.toHaveBeenCalled();
  });

  test("an already mapped widget is not added twice", async () => {
    const { addWidgetEntry } = await import("./widget-config.js");
    addWidgetEntry("dev", ENTRY);

    expect(writeToConfigFileMock.mock.calls[0][0].dev.widgetList).toEqual([ENTRY]);
  });

  test("removes every entry of a widget", async () => {
    const { removeWidgetEntries } = await import("./widget-config.js");
    removeWidgetEntries("dev", "w1");

    expect(writeToConfigFileMock.mock.calls[0][0].dev.widgetList).toEqual([]);
  });

  test("an unknown environment writes nothing", async () => {
    const { addWidgetEntry, upsertWidgetEntries } = await import("./widget-config.js");
    addWidgetEntry("staging", ENTRY);

    expect(upsertWidgetEntries("staging", [ENTRY])).toBe(false);
    expect(writeToConfigFileMock).not.toHaveBeenCalled();
  });

  test("upsert moves a mapped widget to the new folder and adds the others", async () => {
    const { upsertWidgetEntries } = await import("./widget-config.js");
    const moved = { ...ENTRY, folder: "customer-table" };
    const added = { ...ENTRY, folder: "customer-table", widget_id: "w2" };

    expect(upsertWidgetEntries("dev", [moved, added])).toBe(true);
    expect(writeToConfigFileMock.mock.calls[0][0].dev.widgetList).toEqual([moved, added]);
  });

  test("replacing a dashboard's entries keeps the other dashboards' entries", async () => {
    const other = { folder: "alerts", dashboard_id: "d2", widget_id: "w5" };
    getConfigFileMock.mockReturnValue({ default: "dev", dev: { id: "p", widgetList: [ENTRY, other, { ...ENTRY, widget_id: "w3" }] } });
    const { replaceDashboardEntries } = await import("./widget-config.js");
    const relinked = { ...ENTRY, folder: "customer-table", widget_id: "w4" };

    replaceDashboardEntries("dev", ["d1"], [relinked]);

    expect(writeToConfigFileMock.mock.calls[0][0].dev.widgetList).toEqual([other, relinked]);
  });
});

describe("listWidgetFolders", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "widget-folders-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("lists the folders holding an App.tsx, sorted, and skips the rest", async () => {
    for (const folder of ["users", "alerts", "shared", "with space"]) {
      mkdirSync(join(root, "widgets", folder), { recursive: true });
    }
    writeFileSync(join(root, "widgets", "users", "App.tsx"), "");
    writeFileSync(join(root, "widgets", "alerts", "App.tsx"), "");
    writeFileSync(join(root, "widgets", "with space", "App.tsx"), "");
    writeFileSync(join(root, "widgets", "deno.json"), "{}");
    const { listWidgetFolders } = await import("./widget-config.js");

    expect(listWidgetFolders(root, "./widgets")).toEqual(["alerts", "users"]);
    expect(listWidgetFolders(root, "./missing")).toEqual([]);
  });
});

describe("widgetPathOf", () => {
  test("defaults to ./widgets", async () => {
    const { widgetPathOf } = await import("./widget-config.js");

    expect(widgetPathOf({})).toBe("./widgets");
    expect(widgetPathOf({ widgetPath: "./src/widgets" })).toBe("./src/widgets");
  });
});
