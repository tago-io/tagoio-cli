import { Resources, type DeviceEditInfo, type TagsObj } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickDeviceIDFromTagoIO } from "../../prompt/pick-device-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  name?: string;
  description?: string;
  active?: boolean;
  inactive?: boolean;
  network?: string;
  connector?: string;
  chunkRetention?: number;
  tagkey?: string[];
  tagvalue?: string[];
  mergeTags?: boolean;
  silent?: boolean;
  json?: boolean;
}

interface OutputOptions {
  json?: boolean;
}

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

/** Zips the repeatable `--tagkey`/`--tagvalue` arrays into the SDK tag shape, by index. */
function buildTagPairs(keys?: string[], values?: string[]): TagsObj[] {
  return (keys ?? []).map((key, index) => ({ key, value: values?.[index] ?? "" }));
}

/** Merges new tags into existing ones, overriding by key. */
function mergeTags(existing: TagsObj[], incoming: TagsObj[]): TagsObj[] {
  const byKey = new Map(existing.map((tag) => [tag.key, tag.value]));
  for (const tag of incoming) {
    byKey.set(tag.key, tag.value);
  }
  return [...byKey].map(([key, value]) => ({ key, value }));
}

/**
 * @description Shared edit path: applies a DeviceEditInfo patch to a device and
 * reports the result. `device-network` reuses this so both commands edit through
 * one code path.
 */
async function applyDeviceEdit(resources: Resources, id: string, patch: DeviceEditInfo, options: OutputOptions = {}) {
  await resources.devices.edit(id, patch).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to edit device ${id}: ${message}`, "edit_failed", Boolean(options.json));
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Device ${id} updated.`);
}

async function deviceEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", Boolean(options.json));
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", Boolean(options.json));
    }
    id = await pickDeviceIDFromTagoIO(resources);
  }

  // Build the patch from only the flags the user set.
  const patch: DeviceEditInfo = {};
  if (options.name !== undefined) {
    patch.name = options.name;
  }
  if (options.description !== undefined) {
    patch.description = options.description;
  }
  if (options.active || options.inactive) {
    patch.active = Boolean(options.active) && !options.inactive;
  }
  if (options.network !== undefined) {
    patch.network = options.network;
  }
  if (options.connector !== undefined) {
    patch.connector = options.connector;
  }
  if (options.chunkRetention !== undefined) {
    patch.chunk_retention = options.chunkRetention;
  }

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    if (options.mergeTags) {
      const info = await resources.devices.info(id);
      patch.tags = mergeTags(info?.tags ?? [], incoming);
    } else {
      patch.tags = incoming;
    }
  }

  if (Object.keys(patch).length === 0) {
    failWith("Nothing to update — pass at least one field to edit.", "no_changes", Boolean(options.json));
  }

  await applyDeviceEdit(resources, id, patch, { json: options.json });
}

export { deviceEdit, applyDeviceEdit, mergeTags, buildTagPairs };
