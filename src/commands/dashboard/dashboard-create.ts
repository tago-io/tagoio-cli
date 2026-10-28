import { Resources, type DashboardCreateInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { buildTags } from "../devices/device-create.js";
import { parseBlueprintDevices, parseIcon, parseTabs } from "./dashboard-payload.js";

interface IOptions {
  environment?: string;
  blueprint?: boolean;
  blueprintDevices?: string;
  blueprintDevicesFile?: string;
  tab?: string[];
  tabs?: string;
  tabsFile?: string;
  hidden?: boolean;
  icon?: string;
  iconColor?: string;
  tagkey?: string[];
  tagvalue?: string[];
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function dashboardCreate(labelArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  // Parsed before any call so a malformed flag costs no round trip.
  const tabs = parseTabs(options);
  const blueprintDevices = parseBlueprintDevices(options);
  if (blueprintDevices && !options.blueprint) {
    failWith("--blueprint-devices needs --blueprint: slots only exist on a Blueprint dashboard.", "conflicting_flags", options.json);
  }
  const icon = parseIcon(options);
  if (icon && !icon.url) {
    failWith("--icon-color needs --icon: a color alone has no icon to paint.", "missing_icon", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const label = await requireOrFail(labelArg, "label", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Dashboard label:",
  });

  const tags = buildTags(options.tagkey, options.tagvalue);

  // `DashboardCreateInfo` declares only label, arrangement, tags and visible.
  // Probed: the API takes `type`, `tabs` and `blueprint_devices` in the same
  // create call and reads them back, assigning each new slot its ID.
  const payload = {
    label,
    visible: !options.hidden,
    ...(options.blueprint ? { type: "blueprint" } : {}),
    ...(tabs ? { tabs } : {}),
    ...(blueprintDevices ? { blueprint_devices: blueprintDevices } : {}),
    ...(icon ? { icon } : {}),
    ...(tags ? { tags } : {}),
  } as unknown as DashboardCreateInfo;

  const created = await resources.dashboards.create(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to create dashboard ${label}: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  const type = options.blueprint ? "blueprint" : "dashboard";
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: created.dashboard, label, type, visible: !options.hidden })}\n`);
    return;
  }

  successMSG(`Dashboard created: ${label} [${created.dashboard}] (${type}).`);
}

export { dashboardCreate };
