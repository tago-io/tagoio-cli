import type { Resources, WidgetInfo } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";
import { pickDashboardIDFromTagoIO } from "../../prompt/pick-dashboard-id-from-tagoio.js";

interface LookupOptions {
  dashboard?: string;
  silent?: boolean;
  json?: boolean;
}

interface WidgetRow {
  id: string;
  label: string;
  type: string;
  tab: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/** The dashboard from `--dashboard`, or a prompt for it unless `--silent`. */
async function resolveDashboardID(resources: Resources, options: LookupOptions): Promise<string> {
  if (options.dashboard) {
    return options.dashboard;
  }
  if (options.silent) {
    failWith("Missing required input: --dashboard", "missing_input", options.json);
  }
  return pickDashboardIDFromTagoIO(resources);
}

/**
 * @description Lists a dashboard's placed widgets with their position.
 *
 * The API has no widget listing, so this reads the arrangement and then each
 * widget, one call at a time to stay well inside the per-minute request limit.
 * A widget that fails to read still gets a row, so a broken entry is visible
 * rather than silently missing.
 */
async function loadDashboardWidgets(resources: Resources, dashboardID: string, options: LookupOptions): Promise<WidgetRow[]> {
  const dashboard = await resources.dashboards.info(dashboardID).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Dashboard with id ${dashboardID} not found: ${message}`, "not_found", options.json);
  });

  const rows: WidgetRow[] = [];
  for (const placement of dashboard?.arrangement ?? []) {
    const widget = await resources.dashboards.widgets.info(dashboardID, placement.widget_id).catch(() => null);
    rows.push({
      id: placement.widget_id,
      label: widget?.label ?? "(unreadable)",
      type: widget?.type ?? "(unreadable)",
      tab: placement.tab ?? null,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    });
  }
  return rows;
}

/** The widget from the argument, or a prompt over the dashboard's custom widgets unless `--silent`. */
async function resolveWidgetID(resources: Resources, dashboardID: string, widgetArg: string | undefined, options: LookupOptions): Promise<string> {
  if (widgetArg) {
    return widgetArg;
  }
  if (options.silent) {
    failWith("Missing required input: widget ID", "missing_input", options.json);
  }

  const iframes = (await loadDashboardWidgets(resources, dashboardID, options)).filter((row) => row.type === "iframe");
  if (!iframes.length) {
    failWith(`Dashboard ${dashboardID} has no custom widgets.`, "not_found", options.json);
  }

  const { id } = await prompts({
    message: "Which custom widget?",
    name: "id",
    type: "autocomplete",
    choices: iframes.map((row) => ({ title: `${row.label} [${row.id}]`, value: row.id })),
  });
  if (!id) {
    errorHandler("Widget not selected");
  }
  return id as string;
}

/**
 * @description Reads a widget and refuses anything but a custom widget.
 *
 * The gate matters for every command that writes: uploading source rewires
 * `display.url` on any widget the API accepts, and the edits here assume the
 * custom widget's display shape.
 */
async function fetchCustomWidget(resources: Resources, dashboardID: string, widgetID: string, options: LookupOptions): Promise<WidgetInfo> {
  const widget = await resources.dashboards.widgets.info(dashboardID, widgetID).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Widget ${widgetID} not found on dashboard ${dashboardID}: ${message}`, "not_found", options.json);
  });
  if (widget.type !== "iframe") {
    failWith(`Widget ${widgetID} is a "${widget.type}" widget; these commands only handle custom widgets ("iframe").`, "not_custom_widget", options.json);
  }
  return widget;
}

export { fetchCustomWidget, loadDashboardWidgets, resolveDashboardID, resolveWidgetID };
export type { LookupOptions, WidgetRow };
