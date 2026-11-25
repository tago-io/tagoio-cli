import { Resources, type WidgetInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { stripTokenFields } from "../../lib/strip-token-fields.js";
import { fetchCustomWidget, resolveDashboardID, resolveWidgetID } from "./widget-lookup.js";
import { describeGroups, type ResourceEntry, type ResourceOptions } from "./widget-resource.js";

interface IOptions {
  environment?: string;
  dashboard?: string;
  json?: boolean;
  silent?: boolean;
}

/** The display keys a custom widget carries that the SDK types as `any`. */
interface CustomWidgetDisplay {
  url?: string;
  artifact_url?: string | null;
  parameters?: { key: string; value: string }[];
  resource_options?: ResourceOptions;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Describes where the widget's code stands. `display.url` points
 * at the uploaded source and `artifact_url` at the last successful bundle; a
 * source without an artifact never bundled.
 */
function describeCode(display: CustomWidgetDisplay, widgetID: string): string {
  if (!display.url) {
    return "no source uploaded";
  }
  const own = display.url.endsWith(`/widgets/${widgetID}.tsx`);
  const source = own ? "source uploaded" : `points at ${display.url}`;
  return `${source}; ${display.artifact_url ? "bundled" : "never bundled successfully"}`;
}

async function widgetInfo(widgetArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const dashboardID = await resolveDashboardID(resources, options);
  const widgetID = await resolveWidgetID(resources, dashboardID, widgetArg, options);
  const widget = await fetchCustomWidget(resources, dashboardID, widgetID, options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(stripTokenFields(widget))}\n`);
    return;
  }

  const display = (widget.display ?? {}) as CustomWidgetDisplay;
  const resource = (widget as WidgetInfo & { resource?: ResourceEntry[] }).resource ?? [];
  const groups = describeGroups(display.resource_options);

  infoMSG(`Widget Found: ${widget.label} [${widgetID}].`);
  const scalars: Record<string, unknown> = {
    label: widget.label,
    id: widgetID,
    dashboard: dashboardID,
    code: describeCode(display, widgetID),
    analysis_run: widget.analysis_run || "(none)",
    data_sources: widget.data?.length ?? 0,
    filters: groups.length,
  };
  const width = Math.max(...Object.keys(scalars).map((key) => key.length));
  for (const [key, value] of Object.entries(scalars)) {
    writeStatus(`  ${key.padEnd(width)}  ${value ?? ""}`);
  }

  if (display.parameters?.length) {
    infoMSG("Parameters:");
    for (const parameter of display.parameters) {
      writeStatus(`  ${parameter.key} = ${parameter.value}`);
    }
  }

  if (groups.length) {
    infoMSG("Filters:");
    for (const line of groups) {
      writeStatus(`  ${line}`);
    }
  }

  // Entries no filter section produced: entity data sources (`--entity-source`) and anything else.
  const derivedTypes = new Set(["device", "user", "entity_list"]);
  const other = resource.filter((entry) => !derivedTypes.has(entry.type));
  if (other.length) {
    infoMSG("Entity sources and other resources:");
    for (const entry of other) {
      writeStatus(`  ${JSON.stringify(entry)}`);
    }
  }
}

export { describeCode, widgetInfo };
