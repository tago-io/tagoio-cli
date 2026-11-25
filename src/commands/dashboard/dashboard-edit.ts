import { Resources, type DashboardInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickDashboardIDFromTagoIO } from "../../prompt/pick-dashboard-id-from-tagoio.js";
import { buildTagPairs, mergeTags } from "../devices/device-edit.js";
import { type DashboardIcon, parseBlueprintDevices, parseIcon, parseTabs } from "./dashboard-payload.js";

interface IOptions {
  environment?: string;
  label?: string;
  tab?: string[];
  tabs?: string;
  tabsFile?: string;
  blueprintDevices?: string;
  blueprintDevicesFile?: string;
  visible?: boolean;
  hidden?: boolean;
  icon?: string;
  iconColor?: string;
  tagkey?: string[];
  tagvalue?: string[];
  mergeTags?: boolean;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function dashboardEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.visible && options.hidden) {
    failWith("--visible and --hidden cannot be used together.", "conflicting_flags", options.json);
  }

  // Parsed before any call so a malformed flag costs no round trip.
  const tabs = parseTabs(options);
  const blueprintDevices = parseBlueprintDevices(options);
  const icon = parseIcon(options);

  // The dashboard PUT only touches the fields sent, so the patch carries just
  // what was asked for. Tabs and slots replace the stored list as a whole.
  const patch: Record<string, unknown> = {};
  if (options.label !== undefined) {
    patch.label = options.label;
  }
  if (tabs) {
    patch.tabs = tabs;
  }
  if (blueprintDevices) {
    patch.blueprint_devices = blueprintDevices;
  }
  if (options.visible || options.hidden) {
    patch.visible = Boolean(options.visible);
  }

  if (Object.keys(patch).length === 0 && !options.tagkey?.length && !icon) {
    failWith(
      "Nothing to update — pass --label, --tab/--tabs, --blueprint-devices, --visible/--hidden, --icon/--icon-color, or tags.",
      "no_changes",
      options.json,
    );
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickDashboardIDFromTagoIO(resources);
  }

  // Only slots, the icon and merged tags need the stored dashboard; other edits must not pay for the lookup.
  const needsCurrent = Boolean(blueprintDevices) || Boolean(icon) || Boolean(options.tagkey?.length && options.mergeTags);
  const current = needsCurrent
    ? await resources.dashboards.info(id).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        failWith(`Dashboard with id ${id} not found: ${message}`, "not_found", options.json);
      })
    : undefined;

  // Probed: the API stores slots on a Normal dashboard without complaint, and
  // the type stays "dashboard", so the slots would sit there doing nothing.
  if (blueprintDevices && current?.type !== "blueprint") {
    failWith(`Dashboard ${id} is a Normal dashboard; Blueprint slots only work on a Blueprint dashboard.`, "not_blueprint", options.json);
  }

  // The icon goes back whole, so changing only its color keeps the stored url and vice versa.
  if (icon) {
    const merged: DashboardIcon = { ...((current?.icon as DashboardIcon | null) ?? {}), ...icon };
    if (!merged.url) {
      failWith(`Dashboard ${id} has no icon yet; pass --icon with --icon-color.`, "missing_icon", options.json);
    }
    patch.icon = merged;
  }

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    patch.tags = options.mergeTags ? mergeTags(current?.tags ?? [], incoming) : incoming;
  }

  await resources.dashboards.edit(id, patch as Partial<DashboardInfo>).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to edit dashboard ${id}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Dashboard ${id} updated.`);
}

export { dashboardEdit };
