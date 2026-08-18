import { type AccessCreateInfo, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { buildTags } from "../devices/device-create.js";
import { resolvePermissions, resolveTargets } from "./access-policy-payload.js";

interface IOptions {
  environment?: string;
  permissions?: string;
  permissionsFile?: string;
  targets?: string;
  targetsFile?: string;
  inactive?: boolean;
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

async function accessManagementCreate(nameArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  // Both are parsed before anything else so a malformed payload costs no round
  // trip, and both are required: probed, a create without them fails with
  // `{'permissions':[{'message':'Required'}],'targets':[{'message':'Required'}]}`.
  const permissions = resolvePermissions(options);
  if (!permissions) {
    failWith("A policy needs permissions — pass --permissions with JSON, or --permissions-file with a path.", "missing_input", options.json);
  }

  const targets = resolveTargets(options);
  if (!targets) {
    failWith("A policy needs targets — pass --targets with JSON, or --targets-file with a path.", "missing_input", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const name = await requireOrFail(nameArg, "name", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Policy name:",
  });

  const active = !options.inactive;
  const tags = buildTags(options.tagkey, options.tagvalue);

  // `targets` is cast because the SDK declares it as an empty-array literal and
  // carries its own `// TODO: target type`; probed, every target is a triple.
  const payload = {
    name,
    permissions,
    targets,
    active,
    ...(tags ? { tags } : {}),
  } as unknown as AccessCreateInfo;

  const created = await resources.accessManagement.create(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // The API's message is forwarded intact because it lists every valid action
    // and resource — better documentation than anything the CLI could carry.
    failWith(`Failed to create access policy ${name}: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  // `create` resolves `{ am_id }` — the sixth distinct id key in this codebase,
  // after `{ device_id }`, `{ action }`, `{ dictionary }`, `{ user }` and
  // analyses' plain `{ id }`.
  const id = created.am_id;

  if (options.json) {
    // Counts rather than the arrays themselves: the caller just sent them, so
    // echoing them back adds nothing.
    process.stdout.write(
      `${JSON.stringify({
        id,
        name,
        active,
        permissions_count: permissions.length,
        targets_count: targets.length,
      })}\n`,
    );
    return;
  }

  successMSG(`Access policy created: ${name} [${id}] (${permissions.length} permissions, ${targets.length} targets).`);
}

export { accessManagementCreate };
