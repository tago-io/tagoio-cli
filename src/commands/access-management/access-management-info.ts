import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickAccessIDFromTagoIO } from "../../prompt/pick-access-id-from-tagoio.js";
import { mapDate, mapTags } from "../devices/device-list.js";

interface IOptions {
  environment?: string;
  json?: boolean;
  raw?: boolean;
  silent?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/** Renders one permission as a single readable line for the human view. */
function describePermission(permission: { effect?: string; action?: string[]; resource?: string[] }) {
  const action = (permission.action ?? []).join(", ");
  const resource = (permission.resource ?? []).join(" › ");
  return `${permission.effect ?? "?"}  ${action}  on  ${resource}`;
}

async function accessManagementInfo(idArg: string | undefined, options: IOptions) {
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
    id = await pickAccessIDFromTagoIO(resources);
  }

  const info = await resources.accessManagement.info(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Access policy with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  if (options.json) {
    // `permissions` and `targets` pass through untouched: this output is the
    // export half of a round trip, fed back into `access-management-create`
    // --permissions/--targets to move a policy between profiles. Reshaping them
    // here would break that.
    process.stdout.write(
      `${JSON.stringify({
        ...info,
        created_at: mapDate(info.created_at, options),
        updated_at: mapDate(info.updated_at, options),
      })}\n`,
    );
    return;
  }

  // Human view goes entirely to stderr. `console.table` writes to stdout, which
  // is reserved for machine-readable output.
  infoMSG(`Access Policy Found: ${info.name} [${info.id}].`);
  const scalars: Record<string, unknown> = {
    name: info.name,
    id: info.id,
    active: info.active,
    permissions: info.permissions?.length ?? 0,
    targets: info.targets?.length ?? 0,
    tags: info.tags?.length ?? 0,
    created_at: mapDate(info.created_at, options),
    updated_at: mapDate(info.updated_at, options),
  };
  const width = Math.max(...Object.keys(scalars).map((key) => key.length));
  for (const [key, value] of Object.entries(scalars)) {
    writeStatus(`  ${key.padEnd(width)}  ${value ?? ""}`);
  }

  // A policy's name says nothing about what it grants, so the detail is the
  // point of this command rather than an extra.
  if (info.permissions?.length) {
    infoMSG("Permissions:");
    for (const permission of info.permissions) {
      writeStatus(`  ${describePermission(permission)}`);
    }
  }

  if (info.targets?.length) {
    infoMSG("Targets:");
    for (const target of info.targets as unknown as string[][]) {
      writeStatus(`  ${target.join(" › ")}`);
    }
  }

  if (info.tags?.length) {
    infoMSG("Tags:");
    writeStatus(JSON.stringify(mapTags(info.tags, options), null, 2));
  }
}

export { accessManagementInfo, describePermission };
