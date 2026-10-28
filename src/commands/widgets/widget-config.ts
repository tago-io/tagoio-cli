import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { getConfigFile, type IWidgetEntry, writeToConfigFile } from "../../lib/config-file.js";
import { isValidWidgetFolder } from "../../lib/widget-build.js";

const DEFAULT_WIDGET_PATH = "./widgets";

/** The environment a command runs against: the flag, or the default the CLI already resolved. */
function resolveEnvironmentName(environment: string | undefined): string | undefined {
  return environment ?? process.env.TAGOIO_DEFAULT;
}

function widgetPathOf(config: { widgetPath?: string }): string {
  return config.widgetPath || DEFAULT_WIDGET_PATH;
}

/**
 * @description Rewrites one environment's `widgetList` in tagoconfig.json.
 *
 * Goes through `writeToConfigFile`, not `writeConfigFileEnv`: the latter also
 * makes the environment the active default, which registering a widget must
 * not do. Returns false when the environment is not in the file, so a caller
 * that reports success can check it.
 */
function updateWidgetList(environment: string, update: (list: IWidgetEntry[]) => IWidgetEntry[]): boolean {
  const configFile = getConfigFile();
  const env = configFile?.[environment];
  if (!configFile || !env) {
    return false;
  }
  env.widgetList = update(env.widgetList ?? []);
  writeToConfigFile(configFile);
  return true;
}

/** Adds a placement, unless that widget is already mapped. */
function addWidgetEntry(environment: string, entry: IWidgetEntry): void {
  updateWidgetList(environment, (list) => (list.some((item) => item.widget_id === entry.widget_id) ? list : [...list, entry]));
}

/** Maps each widget to its folder, moving a widget that was mapped to another folder. */
function upsertWidgetEntries(environment: string, entries: IWidgetEntry[]): boolean {
  const widgetIDs = new Set(entries.map((entry) => entry.widget_id));
  return updateWidgetList(environment, (list) => [...list.filter((item) => !widgetIDs.has(item.widget_id)), ...entries]);
}

/** Replaces every placement on the given dashboards with `entries`; other dashboards' placements stay. */
function replaceDashboardEntries(environment: string, dashboardIDs: string[], entries: IWidgetEntry[]): boolean {
  const dashboards = new Set(dashboardIDs);
  return updateWidgetList(environment, (list) => [...list.filter((item) => !dashboards.has(item.dashboard_id)), ...entries]);
}

function removeWidgetEntries(environment: string, widgetID: string): void {
  updateWidgetList(environment, (list) => list.filter((item) => item.widget_id !== widgetID));
}

/** Drops every placement on a dashboard, which takes its widgets with it when deleted. */
function removeDashboardEntries(environment: string, dashboardID: string): void {
  updateWidgetList(environment, (list) => list.filter((item) => item.dashboard_id !== dashboardID));
}

/** The folders under widgetPath holding an App.tsx: the ones a widget can be linked to. */
function listWidgetFolders(projectRoot: string, widgetPath: string): string[] {
  const root = resolve(projectRoot, widgetPath);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidWidgetFolder(entry.name) && existsSync(join(root, entry.name, "App.tsx")))
    .map((entry) => entry.name)
    .sort();
}

export {
  addWidgetEntry,
  DEFAULT_WIDGET_PATH,
  listWidgetFolders,
  removeDashboardEntries,
  removeWidgetEntries,
  replaceDashboardEntries,
  resolveEnvironmentName,
  upsertWidgetEntries,
  widgetPathOf,
};
