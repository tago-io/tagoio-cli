import { Resources, type DashboardInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { stripTokenFields } from "../../lib/strip-token-fields.js";
import { pickDashboardIDFromTagoIO } from "../../prompt/pick-dashboard-id-from-tagoio.js";
import { mapDate, mapTags } from "../devices/device-list.js";

interface IOptions {
  environment?: string;
  json?: boolean;
  raw?: boolean;
  silent?: boolean;
}

/** The SDK types `tabs` as `[]` and `blueprint_devices` as a one-element tuple; these are the shapes the API returns. */
interface Tab {
  key: string;
  value: string;
  type?: string | null;
  hidden?: boolean | null;
}

interface BlueprintSlot {
  id: string;
  name: string;
  type?: string;
  conditions?: { key: string; value: string }[];
  filter_conditions?: { type?: string; tag_key?: string; blueprint_device?: string }[];
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Counts the placed widgets per tab key. Widgets on a dashboard
 * without tabs carry `tab: null`, reported under "(no tab)".
 */
function countWidgetsByTab(info: Pick<DashboardInfo, "arrangement">): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of info.arrangement ?? []) {
    const tab = entry.tab ?? "(no tab)";
    counts[tab] = (counts[tab] ?? 0) + 1;
  }
  return counts;
}

/** A `tag_match` filter keeps the options whose `tag_key` tag holds the ID picked in the named slot. */
function describeSlot(slot: BlueprintSlot): string {
  const conditions = (slot.conditions ?? []).map((condition) => `${condition.key}=${condition.value}`).join(", ");
  const filters = (slot.filter_conditions ?? []).map((filter) => `${filter.tag_key}=<${filter.blueprint_device}>`).join(", ");
  return `${slot.name} [${slot.id}] (${slot.type ?? "device"}${conditions ? `: ${conditions}` : ""}${filters ? `; filtered by ${filters}` : ""})`;
}

async function dashboardInfo(idArg: string | undefined, options: IOptions) {
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

  const info = await resources.dashboards.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Dashboard with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  if (options.json) {
    const visible = stripTokenFields(info) as DashboardInfo;
    process.stdout.write(
      `${JSON.stringify({
        ...visible,
        created_at: mapDate(info.created_at, options),
        updated_at: mapDate(info.updated_at, options),
      })}\n`,
    );
    return;
  }

  const tabs = (info.tabs ?? []) as Tab[];
  const slots = (info.blueprint_devices ?? []) as BlueprintSlot[];
  const widgetsByTab = countWidgetsByTab(info);

  infoMSG(`Dashboard Found: ${info.label} [${info.id}].`);
  const scalars: Record<string, unknown> = {
    label: info.label,
    id: info.id,
    type: info.type,
    visible: info.visible,
    widgets: info.arrangement?.length ?? 0,
    tabs: tabs.length,
    tags: info.tags?.length ?? 0,
    created_at: mapDate(info.created_at, options),
    updated_at: mapDate(info.updated_at, options),
  };
  const width = Math.max(...Object.keys(scalars).map((key) => key.length));
  for (const [key, value] of Object.entries(scalars)) {
    writeStatus(`  ${key.padEnd(width)}  ${value ?? ""}`);
  }

  if (tabs.length) {
    infoMSG("Tabs:");
    for (const tab of tabs) {
      const kind = tab.type || (tab.hidden ? "hidden" : "");
      writeStatus(`  ${tab.key} = ${tab.value}${kind ? ` (${kind})` : ""}  widgets: ${widgetsByTab[tab.key] ?? 0}`);
    }
  }

  // Widgets bind to a slot by its ID, so the ID is what a caller needs from here.
  if (slots.length) {
    infoMSG("Blueprint slots:");
    for (const slot of slots) {
      writeStatus(`  ${describeSlot(slot)}`);
    }
  }

  if (info.tags?.length) {
    infoMSG("Tags:");
    writeStatus(JSON.stringify(mapTags(info.tags, options), null, 2));
  }
}

export { countWidgetsByTab, dashboardInfo };
