import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveScope } from "../../lib/resolve-scope.js";
import { removeWidgetEntries, resolveEnvironmentName } from "./widget-config.js";
import { fetchCustomWidget, resolveDashboardID, resolveWidgetID } from "./widget-lookup.js";
import { removeWidget } from "./widget-placement.js";

interface IOptions {
  environment?: string;
  dashboard?: string;
  yes?: boolean;
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
 * @description Takes a widget off its dashboard and deletes it, then drops it
 * from this environment's widgetList.
 *
 * The placement goes first: a deleted widget left in the arrangement would be
 * an empty slot on the dashboard.
 */
async function widgetDelete(widgetArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const dashboardID = await resolveDashboardID(resources, options);
  const widgetID = await resolveWidgetID(resources, dashboardID, widgetArg, options);

  // Only custom widgets: this family never deletes a chart or form by mistake.
  const widget = await fetchCustomWidget(resources, dashboardID, widgetID, options);

  if (!options.silent && !options.yes) {
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Permanently delete custom widget "${widget.label}"? Its uploaded source goes with it.`,
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  const dashboard = await resources.dashboards.info(dashboardID).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Dashboard with id ${dashboardID} not found: ${message}`, "not_found", options.json);
  });
  const arrangement = dashboard.arrangement ?? [];
  if (arrangement.some((entry) => entry.widget_id === widgetID)) {
    await resources.dashboards.edit(dashboardID, { arrangement: removeWidget(arrangement, widgetID) }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Could not take widget ${widgetID} off the dashboard, so it was not deleted: ${message}`, "delete_failed", options.json);
    });
  }

  await resources.dashboards.widgets.delete(dashboardID, widgetID).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Widget ${widgetID} was taken off the dashboard but could not be deleted: ${message}`, "delete_failed", options.json);
  });

  const environment = resolveEnvironmentName(options.environment);
  const removedFromList = Boolean(environment) && resolveScope().scope === "local" && (config.widgetList ?? []).some((entry) => entry.widget_id === widgetID);
  if (removedFromList && environment) {
    removeWidgetEntries(environment, widgetID);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: widgetID, dashboard_id: dashboardID, deleted: true })}\n`);
    return;
  }

  successMSG(`Widget ${widgetID} deleted.`);
  if (removedFromList) {
    infoMSG(`Removed it from widgetList (${environment}).`);
  }
}

export { widgetDelete };
