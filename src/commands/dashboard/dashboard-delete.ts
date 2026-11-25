import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveScope } from "../../lib/resolve-scope.js";
import { pickDashboardIDFromTagoIO } from "../../prompt/pick-dashboard-id-from-tagoio.js";
import { removeDashboardEntries, resolveEnvironmentName } from "../widgets/widget-config.js";

interface IOptions {
  environment?: string;
  yes?: boolean;
  silent?: boolean;
  json?: boolean;
}

interface DashboardScope {
  label: string;
  widgets: number;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Reads the dashboard's label and how many widgets it holds.
 * Best-effort: a failed lookup falls back to the bare id, since a delete should
 * not be blocked by a failed read.
 */
async function describeTarget(resources: Resources, id: string): Promise<DashboardScope> {
  const info = await resources.dashboards.info(id).catch(() => null);
  return {
    label: info?.label ? `dashboard "${info.label}"` : `dashboard ${id}`,
    widgets: info?.arrangement?.length ?? 0,
  };
}

/**
 * @description Builds the confirmation text. The widget count is the part worth
 * naming: the widgets go with the dashboard, and a custom widget's uploaded
 * source goes with its widget.
 */
function buildDeleteMessage(target: string, widgets: number): string {
  const count = `${widgets} widget${widgets === 1 ? "" : "s"}`;
  return `Permanently delete ${target}? Its ${count} go with it.`;
}

async function dashboardDelete(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickDashboardIDFromTagoIO(resources);
  }

  // Destructive op: confirm unless --silent or -y.
  if (!options.silent && !options.yes) {
    const scope = await describeTarget(resources, id);
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: buildDeleteMessage(scope.label, scope.widgets),
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.dashboards.delete(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete dashboard ${id}: ${message}`, "delete_failed", options.json);
  });

  // Its widgets went with it, so their widgetList entries would point at nothing.
  const environment = resolveEnvironmentName(options.environment);
  const removedFromList = Boolean(environment) && resolveScope().scope === "local" && (config.widgetList ?? []).some((entry) => entry.dashboard_id === id);
  if (removedFromList && environment) {
    removeDashboardEntries(environment, id);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`Dashboard ${id} deleted.`);
  if (removedFromList) {
    infoMSG(`Removed its widgets from widgetList (${environment}).`);
  }
}

export { buildDeleteMessage, dashboardDelete, describeTarget };
