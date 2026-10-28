import { Resources, type WidgetInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { fetchCustomWidget, resolveDashboardID, resolveWidgetID } from "./widget-lookup.js";
import {
  applyFrameSettings,
  parseData,
  parseEntitySources,
  parseFilters,
  parseFrameSettings,
  parseMaxData,
  parseParams,
  type WidgetFlagOptions,
} from "./widget-payload.js";
import { applyEntitySources, applyFilterGroups, type ResourceEntry, type ResourceOptions } from "./widget-resource.js";

interface IOptions extends WidgetFlagOptions {
  environment?: string;
  dashboard?: string;
  label?: string;
  analysis?: string;
  clearAnalysis?: boolean;
  silent?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

interface ParsedEdit {
  parameters: ReturnType<typeof parseParams>;
  data: ReturnType<typeof parseData>;
  maxData: ReturnType<typeof parseMaxData>;
  frameSettings: ReturnType<typeof parseFrameSettings>;
  filters: ReturnType<typeof parseFilters>;
  entitySources: ReturnType<typeof parseEntitySources>;
}

/**
 * @description Merges the requested changes over the stored widget.
 *
 * Probed: the widget PUT does not merge. A body with only `display.max_data`
 * dropped `url` and `parameters`, and any body without `analysis_run` cleared
 * it. So a touched `display` goes back whole, with the stored `url`,
 * `artifact_url` and Admin `resource_options` in it, and `analysis_run` is
 * always sent.
 */
function buildPatch(current: WidgetInfo, parsed: ParsedEdit, options: IOptions): Partial<WidgetInfo> {
  const patch: Record<string, unknown> = {};
  if (options.label !== undefined) {
    patch.label = options.label;
  }
  if (parsed.data) {
    patch.data = parsed.data;
  }

  const display = { ...(current.display ?? {}) } as Record<string, unknown>;
  let displayChanged = false;
  if (parsed.parameters) {
    display.parameters = parsed.parameters;
    displayChanged = true;
  }
  if (parsed.maxData) {
    display.max_data = parsed.maxData;
    displayChanged = true;
  }
  if (parsed.frameSettings) {
    display.frame_settings = applyFrameSettings(display.frame_settings, parsed.frameSettings);
    displayChanged = true;
  }
  if (parsed.filters) {
    const next = applyFilterGroups(
      { resourceOptions: display.resource_options as ResourceOptions | undefined, resource: (current as WidgetInfo & { resource?: ResourceEntry[] }).resource },
      parsed.filters,
    );
    display.resource_options = next.resourceOptions;
    patch.resource = next.resource;
    displayChanged = true;
  }
  if (displayChanged) {
    patch.display = display;
  }
  if (parsed.entitySources) {
    // Applied over the filters' result, so both can change in one edit.
    const resource = (patch.resource ?? (current as WidgetInfo & { resource?: ResourceEntry[] }).resource) as ResourceEntry[] | undefined;
    patch.resource = applyEntitySources(resource, parsed.entitySources);
  }

  patch.analysis_run = options.clearAnalysis ? null : (options.analysis ?? current.analysis_run ?? null);
  return patch as Partial<WidgetInfo>;
}

function hasChange(parsed: ParsedEdit, options: IOptions): boolean {
  return (
    options.label !== undefined ||
    options.analysis !== undefined ||
    Boolean(options.clearAnalysis) ||
    Boolean(parsed.parameters || parsed.data || parsed.maxData || parsed.frameSettings || parsed.filters || parsed.entitySources)
  );
}

async function widgetEdit(widgetArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.analysis && options.clearAnalysis) {
    failWith("--analysis and --clear-analysis cannot be used together.", "conflicting_flags", options.json);
  }

  // Parsed before any call so a malformed flag costs no round trip.
  const parsed: ParsedEdit = {
    parameters: parseParams(options.param ?? [], options),
    data: parseData(options),
    maxData: parseMaxData(options),
    frameSettings: parseFrameSettings(options),
    filters: parseFilters(options),
    entitySources: parseEntitySources(options),
  };
  if (!hasChange(parsed, options)) {
    failWith(
      "Nothing to update — pass --label, --param, --data, --max-data, --frame-settings, a filter flag, --entity-source, or --analysis.",
      "no_changes",
      options.json,
    );
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const dashboardID = await resolveDashboardID(resources, options);
  const widgetID = await resolveWidgetID(resources, dashboardID, widgetArg, options);
  const current = await fetchCustomWidget(resources, dashboardID, widgetID, options);

  await resources.dashboards.widgets.edit(dashboardID, widgetID, buildPatch(current, parsed, options)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to edit widget ${widgetID}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: widgetID, dashboard_id: dashboardID, updated: true })}\n`);
    return;
  }

  successMSG(`Widget ${widgetID} updated.`);
}

export { buildPatch, widgetEdit };
