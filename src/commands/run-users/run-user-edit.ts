import { Resources, type UserInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickRunUserIDFromTagoIO } from "../../prompt/pick-run-user-id-from-tagoio.js";
import { buildTagPairs, mergeTags } from "../devices/device-edit.js";
import { resolveRunUserPassword } from "./run-user-password.js";

interface IOptions {
  environment?: string;
  name?: string;
  company?: string;
  phone?: string;
  language?: string;
  timezone?: string;
  activate?: boolean;
  deactivate?: boolean;
  resetPassword?: boolean;
  tagkey?: string[];
  tagvalue?: string[];
  mergeTags?: boolean;
  silent?: boolean;
  json?: boolean;
}

/**
 * `Partial<UserInfo>` has no `password` key: `UserInfo extends
 * Omit<UserCreateInfo, "password">`, so the type cannot express a reset.
 *
 * The runtime accepts one anyway — probed against a live profile, which returned
 * "TagoIO Run User Successfully Updated" and changed the password. The omission
 * is a type-level artifact, not an API restriction, so the cast is the narrowest
 * way to express what the endpoint actually supports.
 */
type UserEditPatch = Partial<UserInfo> & { password?: string };

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/** Copies the plain scalar patches that need no interpretation. */
function buildFieldPatch(options: IOptions): UserEditPatch {
  const patch: UserEditPatch = {};
  const fields = ["name", "company", "phone", "language", "timezone"] as const;
  for (const field of fields) {
    if (options[field] !== undefined) {
      patch[field] = options[field];
    }
  }
  return patch;
}

async function runUserEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.activate && options.deactivate) {
    failWith("--activate and --deactivate cannot be used together.", "conflicting_flags", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    id = await pickRunUserIDFromTagoIO(resources);
  }

  const patch = buildFieldPatch(options);

  if (options.activate || options.deactivate) {
    patch.active = Boolean(options.activate);
  }

  if (options.resetPassword) {
    // The password has one input, so this path cannot run under --silent.
    patch.password = await resolveRunUserPassword(options, "New password:");
  }

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    if (options.mergeTags) {
      // Probed users carry access=admin, organization_id and visualize_user, so
      // a replace drops authorization data. Only the merge path reads first.
      const info = await resources.run.userInfo(id);
      patch.tags = mergeTags(info?.tags ?? [], incoming);
    } else {
      patch.tags = incoming;
    }
  }

  if (Object.keys(patch).length === 0) {
    failWith("Nothing to update — pass a field to change, --reset-password, or tags.", "no_changes", options.json);
  }

  await resources.run.userEdit(id, patch).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // The API's message only. Echoing the patch would put a new password into
    // whatever captured the error.
    failWith(`Failed to edit run user ${id}: ${message}`, "edit_failed", options.json);
  });

  if (options.json) {
    // `run.userEdit` resolves a plain string ("TagoIO Run User Successfully
    // Updated"), so the ack is synthesized, as `secret-edit` does.
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Run user ${id} updated.`);
}

export { runUserEdit };
