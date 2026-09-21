import { type ActionCreateInfo, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickActionIDFromTagoIO } from "../../prompt/pick-action-id-from-tagoio.js";
import { buildTagPairs, mergeTags } from "../devices/device-edit.js";
import { parseJSONFlag } from "./action-builders.js";

interface IOptions {
  environment?: string;
  name?: string;
  description?: string;
  active?: boolean;
  inactive?: boolean;
  tagkey?: string[];
  tagvalue?: string[];
  mergeTags?: boolean;
  triggerJson?: string;
  actionJson?: string;
  silent?: boolean;
  json?: boolean;
}

interface OutputOptions {
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Shared edit path: applies a patch to an action and reports the
 * result. `action-enable` / `action-disable` reuse this so every edit-shaped
 * command goes through one code path, mirroring `applyDeviceEdit`.
 */
async function applyActionEdit(resources: Resources, id: string, patch: Partial<ActionCreateInfo>, options: OutputOptions = {}) {
  await resources.actions.edit(id, patch).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to edit action ${id}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Action ${id} updated.`);
}

async function actionEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.active && options.inactive) {
    failWith("Pass only one of --active or --inactive.", "conflicting_flags", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickActionIDFromTagoIO(resources);
  }

  // Build the patch from only the flags the caller actually set.
  const patch: Partial<ActionCreateInfo> = {};
  if (options.name !== undefined) {
    patch.name = options.name;
  }
  if (options.description !== undefined) {
    patch.description = options.description;
  }
  if (options.active || options.inactive) {
    patch.active = Boolean(options.active);
  }

  // Trigger and action are replaced wholesale: the API overwrites these fields,
  // so a partial edit would silently drop whatever the CLI does not model.
  if (options.triggerJson !== undefined) {
    patch.trigger = parseJSONFlag(options.triggerJson, "--trigger-json", "array", options) as ActionCreateInfo["trigger"];
  }
  if (options.actionJson !== undefined) {
    patch.action = parseJSONFlag(options.actionJson, "--action-json", "object", options) as ActionCreateInfo["action"];
  }

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    if (options.mergeTags) {
      const info = await resources.actions.info(id);
      patch.tags = mergeTags(info?.tags ?? [], incoming);
    } else {
      patch.tags = incoming;
    }
  }

  if (Object.keys(patch).length === 0) {
    failWith("Nothing to update — pass at least one field to edit.", "no_changes", options.json);
  }

  await applyActionEdit(resources, id, patch, { json: options.json });
}

export { actionEdit, applyActionEdit };
