import { join } from "node:path";

import { type DashboardInfo, Resources } from "@tago-io/sdk";
import prompts from "prompts";
import stringComparison from "string-comparison";

import { getApiURL, getEnvironmentConfig, type IWidgetEntry } from "../../lib/config-file.js";
import { type DashboardWidget, listDashboardWidgets, type TransportContext } from "../../lib/custom-widget-transport.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { confirmPrompt } from "../../prompt/confirm.js";
import { requireLocalScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { searchName } from "../../lib/search-name.js";
import { isValidWidgetFolder } from "../../lib/widget-build.js";
import { listWidgetFolders, replaceDashboardEntries, resolveEnvironmentName, upsertWidgetEntries, widgetPathOf } from "./widget-config.js";

interface IOptions {
  environment?: string;
  dashboard?: string;
  widget?: string[];
  silent?: boolean;
  json?: boolean;
}

/** A custom widget the picker offers, with the dashboard it sits on. */
interface LinkCandidate {
  dashboard: Pick<DashboardInfo, "id" | "label">;
  widget: DashboardWidget;
}

interface LinkContext {
  environment: string;
  transport: TransportContext;
  widgetPath: string;
  folders: string[];
  current: IWidgetEntry[];
  json?: boolean;
}

/** A linked widget with its label, which only the report shows. */
type LinkedWidget = IWidgetEntry & { label: string };

/**
 * The folder prompt's value for "leave this widget unlinked". It must be truthy:
 * prompts' autocomplete answers the choice's title when its value is falsy.
 * `>` is never in a folder name, so it cannot collide with one.
 */
const SKIP = "> skip";
const DASHBOARD_PAGE_SIZE = 100;

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/** A cancelled prompt (Ctrl+C) answers undefined; nothing has been written yet, so the command stops. */
function requireAnswer<T>(answer: T | undefined, json?: boolean): T {
  if (answer === undefined) {
    failWith("Cancelled; widgetList is unchanged.", "cancelled", json);
  }
  return answer;
}

function checkFolder(folder: string, context: LinkContext): void {
  if (!isValidWidgetFolder(folder)) {
    failWith(`"${folder}" is not a widget folder name: use one folder under ${context.widgetPath}.`, "folder_not_found", context.json);
  }
  if (!context.folders.includes(folder)) {
    const closest = searchName(
      folder,
      context.folders.map((name) => ({ names: [name], value: name })),
    );
    const hint = closest ? ` Did you mean "${closest}"?` : "";
    failWith(`No App.tsx in ${join(context.widgetPath, folder)}.${hint}`, "folder_not_found", context.json);
  }
}

async function listWidgets(context: LinkContext, dashboardID: string): Promise<DashboardWidget[]> {
  return listDashboardWidgets(context.transport, dashboardID).catch((error: unknown) => {
    failWith(error instanceof Error ? error.message : String(error), "list_failed", context.json);
  });
}

/** The widgetList entry, without the label the report uses. */
function toEntry(linked: LinkedWidget): IWidgetEntry {
  return { folder: linked.folder, dashboard_id: linked.dashboard_id, widget_id: linked.widget_id };
}

function save(written: boolean, context: LinkContext): void {
  if (!written) {
    failWith(`Environment "${context.environment}" is not in this project's tagoconfig.json.`, "env_not_found", context.json);
  }
}

/**
 * @description `widget-link <folder> --dashboard <id> --widget <id>`: checks
 * every widget against the dashboard's list before writing, so a typo writes
 * nothing. A widget already mapped to another folder moves to this one.
 */
async function linkDirect(folder: string | undefined, options: IOptions, context: LinkContext): Promise<void> {
  if (!folder || !options.dashboard || !options.widget?.length) {
    failWith("Missing required input: pass <folder> --dashboard <id> --widget <id>, or run without them to pick.", "missing_input", options.json);
  }
  checkFolder(folder, context);

  const dashboardID = options.dashboard;
  const widgets = await listWidgets(context, dashboardID);
  const linked = [...new Set(options.widget)].map((widgetID) => {
    const widget = widgets.find((item) => item.id === widgetID);
    if (!widget) {
      failWith(`Widget ${widgetID} is not on dashboard ${dashboardID}.`, "not_found", options.json);
    }
    if (widget.type !== "iframe") {
      failWith(`Widget ${widgetID} is a "${widget.type}" widget, not a custom widget.`, "not_custom_widget", options.json);
    }
    return { folder, dashboard_id: dashboardID, widget_id: widgetID, label: widget.label };
  });

  save(upsertWidgetEntries(context.environment, linked.map(toEntry)), context);
  report({ linked, removed: [] }, options);
}

/**
 * @description Every dashboard of the profile, a page of 100 at a time. Also
 * stops on a page with nothing new, so an API that ignored `page` could not
 * loop forever.
 */
async function listAllDashboards(resources: Resources): Promise<Pick<DashboardInfo, "id" | "label">[]> {
  const dashboards = new Map<string, Pick<DashboardInfo, "id" | "label">>();
  for (let page = 1; ; page++) {
    const batch = await resources.dashboards.list({ page, amount: DASHBOARD_PAGE_SIZE, fields: ["id", "label"] });
    const fresh = batch.filter((dashboard) => !dashboards.has(dashboard.id));
    fresh.forEach((dashboard) => dashboards.set(dashboard.id, dashboard));
    if (batch.length < DASHBOARD_PAGE_SIZE || !fresh.length) {
      return [...dashboards.values()];
    }
  }
}

function toDashboardLinkChoices(dashboards: Pick<DashboardInfo, "id" | "label">[], current: IWidgetEntry[]) {
  return dashboards.map((dashboard) => ({
    title: `${dashboard.label} [${dashboard.id}]`,
    value: dashboard,
    selected: current.some((entry) => entry.dashboard_id === dashboard.id),
  }));
}

function toWidgetLinkChoices(candidates: LinkCandidate[], current: IWidgetEntry[]) {
  return candidates.map((candidate) => ({
    title: `${candidate.dashboard.label} › ${candidate.widget.label || "(no label)"} [${candidate.widget.id}]`,
    value: candidate,
    selected: current.some((entry) => entry.widget_id === candidate.widget.id),
  }));
}

/**
 * @description The folder already linked comes first, then the folders closest
 * to the widget's label, then Skip. When the linked folder no longer exists,
 * Skip comes first, so Enter does not quietly re-point the widget elsewhere.
 */
function toFolderChoices(folders: string[], label: string, currentFolder: string | undefined) {
  const name = label.toLowerCase().replace(/\s+/g, "-");
  const distance = (folder: string) => (folder === currentFolder ? -1 : stringComparison.cosine.distance(name, folder));
  const ordered = [...folders].sort((a, b) => distance(a) - distance(b)).map((folder) => ({ title: folder, value: folder }));
  const skip = { title: "> Skip", value: SKIP };
  return currentFolder && !folders.includes(currentFolder) ? [skip, ...ordered] : [...ordered, skip];
}

/** The custom widgets on the chosen dashboards, one request per dashboard. */
async function loadCandidates(dashboards: Pick<DashboardInfo, "id" | "label">[], context: LinkContext): Promise<LinkCandidate[]> {
  const candidates: LinkCandidate[] = [];
  for (const dashboard of dashboards) {
    const widgets = (await listWidgets(context, dashboard.id)).filter((widget) => widget.type === "iframe");
    if (!widgets.length && !context.json) {
      infoMSG(`${dashboard.label}: no custom widgets.`);
    }
    candidates.push(...widgets.map((widget) => ({ dashboard, widget })));
  }
  return candidates;
}

/**
 * @description Asks one widget's folder. Enter on a filter that matches
 * nothing also answers undefined, so only Ctrl+C (onCancel) cancels the run;
 * an empty answer asks again rather than discarding the folders already picked.
 */
async function askFolder(candidate: LinkCandidate, currentFolder: string | undefined, context: LinkContext): Promise<string> {
  const missing = currentFolder && !context.folders.includes(currentFolder) ? ` (was "${currentFolder}", folder missing)` : "";
  for (;;) {
    let aborted = false;
    const { folder } = await prompts(
      {
        type: "autocomplete",
        name: "folder",
        message: `Folder for "${candidate.widget.label || candidate.widget.id}" (${candidate.dashboard.label})${missing}:`,
        choices: toFolderChoices(context.folders, candidate.widget.label, currentFolder),
      },
      {
        onCancel: () => {
          aborted = true;
        },
      },
    );
    if (aborted) {
      failWith("Cancelled; widgetList is unchanged.", "cancelled", context.json);
    }
    if (folder !== undefined) {
      return folder as string;
    }
    infoMSG("No folder matched; pick one from the list or > Skip.");
  }
}

/** Asks for each chosen widget's folder; Skip leaves it out. */
async function chooseFolders(chosen: LinkCandidate[], context: LinkContext) {
  const linked: LinkedWidget[] = [];
  for (const candidate of chosen) {
    const currentFolder = context.current.find((entry) => entry.widget_id === candidate.widget.id)?.folder;
    const folder = await askFolder(candidate, currentFolder, context);
    if (folder !== SKIP) {
      linked.push({ folder, dashboard_id: candidate.dashboard.id, widget_id: candidate.widget.id, label: candidate.widget.label });
    }
  }
  return linked;
}

/** Lists the widgets about to be unlinked and asks before writing. */
async function confirmUnlinks(removed: IWidgetEntry[], context: LinkContext): Promise<void> {
  if (!removed.length) {
    return;
  }
  for (const entry of removed) {
    infoMSG(`Will unlink widget ${entry.widget_id} (${entry.folder}).`);
  }
  if (!(await confirmPrompt(`Unlink ${removed.length} widget(s) from widgetList?`))) {
    failWith("Cancelled; widgetList is unchanged.", "cancelled", context.json);
  }
}

/**
 * @description `widget-link` with no arguments: dashboards, then their custom
 * widgets, then a folder for each. The chosen dashboards' placements are
 * replaced by the answer, so a widget left unchecked or skipped is unlinked;
 * other dashboards' placements stay.
 */
async function linkInteractive(resources: Resources, context: LinkContext): Promise<void> {
  if (!context.folders.length) {
    failWith(`No widget folder with an App.tsx under ${context.widgetPath}.`, "no_folders", context.json);
  }

  const { dashboards } = await prompts({
    type: "autocompleteMultiselect",
    name: "dashboards",
    message: "Which dashboards hold the custom widgets to link?",
    choices: toDashboardLinkChoices(await listAllDashboards(resources), context.current),
  });
  const chosenDashboards = requireAnswer<Pick<DashboardInfo, "id" | "label">[]>(dashboards, context.json);
  if (!chosenDashboards.length) {
    failWith("No dashboard selected.", "missing_input", context.json);
  }

  const candidates = await loadCandidates(chosenDashboards, context);
  if (!candidates.length) {
    failWith("The chosen dashboards have no custom widgets.", "no_widgets", context.json);
  }
  const { widgets } = await prompts({
    type: "autocompleteMultiselect",
    name: "widgets",
    message: "Which custom widgets to link? Unchecked ones are unlinked.",
    choices: toWidgetLinkChoices(candidates, context.current),
  });

  const linked = await chooseFolders(requireAnswer<LinkCandidate[]>(widgets, context.json), context);
  const dashboardIDs = chosenDashboards.map((dashboard) => dashboard.id);
  const removed = context.current.filter((entry) => dashboardIDs.includes(entry.dashboard_id) && !linked.some((item) => item.widget_id === entry.widget_id));
  await confirmUnlinks(removed, context);

  save(replaceDashboardEntries(context.environment, dashboardIDs, linked.map(toEntry)), context);
  report({ linked, removed }, context);
}

function report(result: { linked: LinkedWidget[]; removed: IWidgetEntry[] }, options: { json?: boolean }): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  for (const entry of result.linked) {
    successMSG(`${entry.folder} → widget ${entry.widget_id} (${entry.label || "no label"})`);
  }
  for (const entry of result.removed) {
    infoMSG(`Unlinked widget ${entry.widget_id} (was ${entry.folder}).`);
  }
  if (!result.linked.length && !result.removed.length) {
    infoMSG("Nothing changed.");
  }
}

async function widgetLink(folderArg: string | undefined, options: IOptions) {
  const scope = requireLocalScope("widget-link");
  printScopeBanner(scope, options.silent);

  const config = getEnvironmentConfig(options.environment);
  const environment = resolveEnvironmentName(options.environment);
  if (!config || !config.profileToken || !environment) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const widgetPath = widgetPathOf(config);
  const context: LinkContext = {
    environment,
    transport: { apiURL: getApiURL(config.profileRegion), token: config.profileToken },
    widgetPath,
    folders: listWidgetFolders(scope.root, widgetPath),
    current: config.widgetList ?? [],
    json: options.json,
  };

  if (folderArg || options.dashboard || options.widget?.length) {
    return linkDirect(folderArg, options, context);
  }
  if (options.silent) {
    failWith("Missing required input: <folder> --dashboard <id> --widget <id>", "missing_input", options.json);
  }
  return linkInteractive(new Resources({ token: config.profileToken, region: config.profileRegion }), context);
}

export { listAllDashboards, toDashboardLinkChoices, toFolderChoices, toWidgetLinkChoices, widgetLink };
