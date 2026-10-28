import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { Resources, type WidgetInfo } from "@tago-io/sdk";

import { getApiURL, getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, requireOrFail, successMSG } from "../../lib/messages.js";
import { requireLocalScope } from "../../lib/resolve-scope.js";
import { type BuildResult, isValidWidgetFolder } from "../../lib/widget-build.js";
import { addWidgetEntry, resolveEnvironmentName, widgetPathOf } from "./widget-config.js";
import { buildFolder, deployEntries } from "./widget-deploy.js";
import { resolveDashboardID } from "./widget-lookup.js";
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
import { checkPlacement, placeWidget, resolveTab } from "./widget-placement.js";
import { applyEntitySources, applyFilterGroups, type ResourceEntry } from "./widget-resource.js";

interface IOptions extends WidgetFlagOptions {
  environment?: string;
  dashboard?: string;
  analysis?: string;
  folder?: string;
  tab?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  silent?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Builds the create body from the flags, parsed before any call so
 * a malformed flag costs no round trip. A custom widget starts with an empty
 * `display.url`: the first source upload points it at the stored file.
 */
function buildWidgetBody(options: IOptions): (label: string) => WidgetInfo {
  const parameters = parseParams(options.param ?? [], options);
  const data = parseData(options);
  const maxData = parseMaxData(options);
  const frameSettings = parseFrameSettings(options);
  const filters = parseFilters(options);
  const entitySources = parseEntitySources(options);
  const derived = filters ? applyFilterGroups({ resourceOptions: undefined, resource: undefined }, filters) : undefined;
  const resource = entitySources ? applyEntitySources(derived?.resource, entitySources) : derived?.resource;

  return (label) =>
    ({
      label,
      type: "iframe",
      display: {
        url: "",
        ...(parameters ? { parameters } : {}),
        ...(maxData ? { max_data: maxData } : {}),
        ...(frameSettings ? { frame_settings: applyFrameSettings(undefined, frameSettings) } : {}),
        ...(derived ? { resource_options: derived.resourceOptions } : {}),
      },
      ...(data ? { data } : {}),
      ...(resource ? { resource } : {}),
      ...(options.analysis ? { analysis_run: options.analysis } : {}),
    }) as WidgetInfo;
}

/**
 * @description Names an entity data source bound to a Blueprint slot that is
 * not an entity slot: a device slot never yields entity rows, so the widget
 * would stay empty with no error anywhere.
 */
function findNonEntitySlot(resource: ResourceEntry[] | undefined, slots: { id?: string; type?: string; name?: string }[]): string | undefined {
  for (const entry of (resource ?? []).filter((item) => item.type === "entity")) {
    const slot = slots.find((item) => item.id === entry.id);
    if (slot && (slot.type ?? "device") !== "entity") {
      return `Entity source ${entry.id} points at the "${slot.name}" slot, which is a ${slot.type ?? "device"} slot; use an entity slot or an entity ID.`;
    }
  }
  return undefined;
}

async function widgetCreate(labelArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const bodyFor = buildWidgetBody(options);
  const placementError = checkPlacement(options);
  if (placementError) {
    failWith(placementError, "invalid_position", options.json);
  }

  // The folder is built before anything is created: the likely failures (an
  // undeclared package, no default export) are local, and must not leave an
  // empty widget behind that a retry would duplicate.
  const scope = options.folder ? requireLocalScope("widget-create --folder") : undefined;
  let prebuilt: BuildResult | undefined;
  if (scope && options.folder) {
    if (!isValidWidgetFolder(options.folder)) {
      failWith(`"${options.folder}" is not a widget folder name: use one folder under ${widgetPathOf(config)}.`, "folder_not_found", options.json);
    }
    if (!existsSync(join(resolve(scope.root, widgetPathOf(config)), options.folder, "App.tsx"))) {
      failWith(`No App.tsx in ${join(widgetPathOf(config), options.folder)}. A widget folder needs one.`, "folder_not_found", options.json);
    }
    const built = await buildFolder({ projectRoot: scope.root, widgetPath: widgetPathOf(config), buildPath: config.buildPath || "./build" }, options.folder);
    if ("error" in built) {
      failWith(`${built.error} No widget was created.`, "build_failed", options.json);
    }
    prebuilt = built;
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const dashboardID = await resolveDashboardID(resources, options);
  const label = await requireOrFail(labelArg, "label", { silent: options.silent, json: options.json, promptMessage: "Widget label:" });
  const body = bodyFor(label);

  const dashboard = await resources.dashboards.info(dashboardID).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Dashboard with id ${dashboardID} not found: ${message}`, "not_found", options.json);
  });
  const tab = resolveTab((dashboard.tabs ?? []) as { key: string }[], options.tab);
  if ("error" in tab) {
    failWith(tab.error, "invalid_tab", options.json);
  }
  const slotError = findNonEntitySlot(
    (body as WidgetInfo & { resource?: ResourceEntry[] }).resource,
    (dashboard.blueprint_devices ?? []) as { id?: string; type?: string; name?: string }[],
  );
  if (slotError) {
    failWith(slotError, "invalid_entity_source", options.json);
  }

  const created = await resources.dashboards.widgets.create(dashboardID, body).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to create widget ${label}: ${message}`, "create_failed", options.json);
  });
  const widgetID = created.widget;

  // The API replaces the arrangement as a whole, so the full array goes back.
  const arrangement = placeWidget(dashboard.arrangement ?? [], {
    widgetID,
    tab: tab.tab,
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
  });
  await resources.dashboards.edit(dashboardID, { arrangement }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(
      `Widget ${widgetID} was created but could not be placed on the dashboard: ${message}. Remove it with 'widget-delete ${widgetID} --dashboard ${dashboardID}', or place it in the Admin.`,
      "placement_failed",
      options.json,
    );
  });

  let deployed: string | undefined;
  let warnings: string[] = [];
  if (scope && options.folder && prebuilt) {
    const environment = resolveEnvironmentName(options.environment) as string;
    const entry = { folder: options.folder, dashboard_id: dashboardID, widget_id: widgetID };
    addWidgetEntry(environment, entry);
    const [result] = await deployEntries(
      {
        resources,
        transport: { apiURL: getApiURL(config.profileRegion), token: config.profileToken },
        projectRoot: scope.root,
        widgetPath: widgetPathOf(config),
        buildPath: config.buildPath || "./build",
      },
      [entry],
      new Map([[options.folder, prebuilt]]),
    );
    if (result.status !== "deployed") {
      failWith(
        `Widget ${widgetID} was created, placed and added to widgetList, but the deploy failed: ${result.error}. Fix it and run 'widget-deploy ${options.folder}'.`,
        "deploy_failed",
        options.json,
      );
    }
    deployed = options.folder;
    warnings = result.warnings ?? [];
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: widgetID, dashboard_id: dashboardID, label, tab: tab.tab, ...(deployed ? { folder: deployed } : {}) })}\n`);
    return;
  }

  successMSG(`Widget created: ${label} [${widgetID}] on dashboard ${dashboardID}${tab.tab ? `, tab ${tab.tab}` : ""}.`);
  if (deployed) {
    successMSG(`Added to widgetList and deployed from ${deployed}.`);
  }
  for (const warning of warnings) {
    infoMSG(`  ${warning}`);
  }
}

export { buildWidgetBody, widgetCreate };
