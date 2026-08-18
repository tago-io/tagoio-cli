import { type AccessInfo, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickAccessIDFromTagoIO } from "../../prompt/pick-access-id-from-tagoio.js";
import { buildTagPairs, mergeTags } from "../devices/device-edit.js";
import { type AccessTarget, resolvePermissions, resolveTargets } from "./access-policy-payload.js";

/**
 * The patch shape the API accepts, which `Partial<AccessInfo>` cannot express:
 * the SDK declares `targets` as an empty-array literal and carries its own
 * `// TODO: target type`. Probed, every target is a triple.
 */
type AccessEditPatch = Partial<Omit<AccessInfo, "targets">> & { targets?: AccessTarget[] };

interface IOptions {
  environment?: string;
  name?: string;
  permissions?: string;
  permissionsFile?: string;
  targets?: string;
  targetsFile?: string;
  activate?: boolean;
  deactivate?: boolean;
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

async function accessManagementEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.activate && options.deactivate) {
    failWith("--activate and --deactivate cannot be used together.", "conflicting_flags", options.json);
  }

  // Parsed before any API call so a malformed payload costs no round trip.
  const permissions = resolvePermissions(options);
  const targets = resolveTargets(options);

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickAccessIDFromTagoIO(resources);
  }

  const patch: AccessEditPatch = {};

  if (options.name !== undefined) {
    patch.name = options.name;
  }

  // Permissions and targets replace wholesale, mirroring the API's PUT. There is
  // no merge flag for them: a partial permission set is not a meaningful
  // concept, unlike tags.
  if (permissions) {
    patch.permissions = permissions;
  }

  if (targets) {
    patch.targets = targets;
  }

  if (options.activate || options.deactivate) {
    patch.active = Boolean(options.activate);
  }

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    if (options.mergeTags) {
      // Only the merge path reads first — a replace must not pay for a lookup it
      // does not use.
      const info = await resources.accessManagement.info(id);
      patch.tags = mergeTags(info?.tags ?? [], incoming);
    } else {
      patch.tags = incoming;
    }
  }

  if (Object.keys(patch).length === 0) {
    failWith("Nothing to update — pass a field to change, --permissions, --targets, or tags.", "no_changes", options.json);
  }

  await resources.accessManagement.edit(id, patch as Partial<AccessInfo>).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // The API's message is forwarded intact: it lists every valid action and
    // resource, which is better documentation than the CLI could carry.
    failWith(`Failed to edit access policy ${id}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    // `accessManagement.edit` resolves a plain string ("Access Management
    // Successfully Updated"), so the ack is synthesized.
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Access policy ${id} updated.`);
}

export { accessManagementEdit };
