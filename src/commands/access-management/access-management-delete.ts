import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickAccessIDFromTagoIO } from "../../prompt/pick-access-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  yes?: boolean;
  silent?: boolean;
  json?: boolean;
}

interface PolicyScope {
  label: string;
  permissions: number;
  targets: number;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Reads the policy's name and the size of what it grants.
 *
 * This is the only family whose confirmation needs a second API call to be
 * honest: a listing cannot supply `permissions` or `targets` — probed, asking
 * for either returns `Sorry, Internal Error` — and a policy's name says nothing
 * about its blast radius.
 *
 * Best-effort: a failed lookup falls back to the bare id with zero counts, since
 * a delete should not be blocked by a failed read.
 */
async function describeTarget(resources: Resources, id: string): Promise<PolicyScope> {
  const info = await resources.accessManagement.info(id).catch(() => null);
  return {
    label: info?.name ? `access policy "${info.name}"` : `access policy ${id}`,
    permissions: info?.permissions?.length ?? 0,
    targets: info?.targets?.length ?? 0,
  };
}

/**
 * @description Builds the confirmation text. Exported so the wording is
 * assertable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * The counts are the point. Every other resource in this series is
 * self-describing — a device has a name, a secret has a key — but a policy
 * called "[TagoIO Permission for Analysis] - Alert Dispatch" could grant one
 * thing or forty, so the scope has to be spelled out before an operator agrees.
 */
function buildDeleteMessage(target: string, permissions: number, targets: number): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  return (
    `Permanently delete ${target}? It grants ${plural(permissions, "permission")} to ` +
    `${plural(targets, "target")}, and anything relying on it loses access immediately. ` +
    `Use --deactivate on access-management-edit to disable it reversibly instead.`
  );
}

async function accessManagementDelete(idArg: string | undefined, options: IOptions) {
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

  // Destructive op: confirm unless --silent or -y.
  if (!options.silent && !options.yes) {
    const scope = await describeTarget(resources, id);
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: buildDeleteMessage(scope.label, scope.permissions, scope.targets),
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.accessManagement.delete(id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete access policy ${id}: ${message}`, "delete_failed", options.json);
  });

  if (options.json) {
    // `accessManagement.delete` resolves a plain string, so the ack is synthesized.
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`Access policy ${id} deleted.`);
}

export { accessManagementDelete, buildDeleteMessage, describeTarget };
