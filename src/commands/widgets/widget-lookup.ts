import type { Resources, WidgetInfo } from "@tago-io/sdk";
import prompts from "prompts";

import { listDashboardWidgets, type TransportContext } from "../../lib/custom-widget-transport.js";
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
 * Positions come from the arrangement, labels and types from one widget
 * listing request, joined on the widget ID. A placement the listing lacks
 * still gets a row, so a broken entry is visible rather than silently missing.
 */
async function loadDashboardWidgets(resources: Resources, transport: TransportContext, dashboardID: string, options: LookupOptions): Promise<WidgetRow[]> {
  const dashboard = await resources.dashboards.info(dashboardID).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Dashboard with id ${dashboardID} not found: ${message}`, "not_found", options.json);
  });
  const widgets = await listDashboardWidgets(transport, dashboardID).catch((error: unknown) => {
    failWith(error instanceof Error ? error.message : String(error), "list_failed", options.json);
  });
  const byID = new Map(widgets.map((widget) => [widget.id, widget]));

  return (dashboard?.arrangement ?? []).map((placement) => {
    const widget = byID.get(placement.widget_id);
    return {
      id: placement.widget_id,
      label: widget?.label ?? "(unreadable)",
      type: widget?.type ?? "(unreadable)",
      tab: placement.tab ?? null,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
    };
  });
}

/** The widget from the argument, or a prompt over the dashboard's custom widgets unless `--silent`. */
async function resolveWidgetID(
  resources: Resources,
  transport: TransportContext,
  dashboardID: string,
  widgetArg: string | undefined,
  options: LookupOptions,
): Promise<string> {
  if (widgetArg) {
    return widgetArg;
  }
  if (options.silent) {
    failWith("Missing required input: widget ID", "missing_input", options.json);
  }

  const iframes = (await loadDashboardWidgets(resources, transport, dashboardID, options)).filter((row) => row.type === "iframe");
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
