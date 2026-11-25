import { Resources } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { loadDashboardWidgets, resolveDashboardID } from "./widget-lookup.js";

interface IOptions {
  environment?: string;
  type?: string;
  stringify?: boolean;
  json?: boolean;
  silent?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function widgetList(dashboardArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const dashboardID = await resolveDashboardID(resources, { ...options, dashboard: dashboardArg });

  const rows = (await loadDashboardWidgets(resources, dashboardID, options)).filter((row) => !options.type || row.type === options.type);

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(rows)}\n`);
  } else {
    console.table(rows);
  }

  successMSG(`${kleur.cyan(rows.length)} widgets found.`);
}

export { widgetList };
