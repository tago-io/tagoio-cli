import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { fetchCustomWidget, resolveDashboardID, resolveWidgetID } from "./widget-lookup.js";
import { checkPlacement, moveWidget, resolveTab } from "./widget-placement.js";

interface IOptions {
  environment?: string;
  dashboard?: string;
  tab?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Moves a custom widget to another tab, or to another position or
 * size on the dashboard grid. The position lives in the dashboard's
 * arrangement, which the API replaces as a whole, so the full array goes back.
 */
async function widgetMove(widgetArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const { tab, x, y, width, height } = options;
  if ([tab, x, y, width, height].every((value) => value === undefined)) {
    failWith("Nothing to move — pass --tab, or --x, --y, --width or --height.", "no_changes", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const dashboardID = await resolveDashboardID(resources, options);
  const widgetID = await resolveWidgetID(resources, dashboardID, widgetArg, options);
  await fetchCustomWidget(resources, dashboardID, widgetID, options);

  const dashboard = await resources.dashboards.info(dashboardID).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Dashboard with id ${dashboardID} not found: ${message}`, "not_found", options.json);
  });
  const arrangement = dashboard.arrangement ?? [];
  const current = arrangement.find((entry) => entry.widget_id === widgetID);

  // Without --tab the widget stays on its tab; resolveTab would pick the first one.
  const target = tab === undefined && current ? { tab: current.tab ?? null } : resolveTab((dashboard.tabs ?? []) as { key: string }[], tab);
  if ("error" in target) {
    failWith(target.error, "invalid_tab", options.json);
  }

  const moved = moveWidget(arrangement, { widgetID, tab: target.tab, x, y, width, height });
  const placementError = checkPlacement(moved.entry);
  if (placementError) {
    failWith(placementError, "invalid_position", options.json);
  }

  await resources.dashboards.edit(dashboardID, { arrangement: moved.arrangement }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to move widget ${widgetID}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: widgetID, dashboard_id: dashboardID, ...moved.entry })}\n`);
    return;
  }

  const { entry } = moved;
  successMSG(`Widget ${widgetID} moved to ${entry.tab ? `tab ${entry.tab}` : "the dashboard"} at x ${entry.x}, y ${entry.y}, ${entry.width}x${entry.height}.`);
}

export { widgetMove };
