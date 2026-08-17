import { type Account, Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickAnalysisFromTagoIO } from "../../prompt/pick-analysis-from-tagoio.js";

interface IOptions {
  environment?: string;
  yes?: boolean;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Names the analysis in the confirmation.
 *
 * Best-effort — falls back to the bare id when the lookup fails, since a delete
 * should not be blocked by a failed read.
 */
async function describeTarget(resources: Resources, id: string): Promise<string> {
  const info = await resources.analysis.info(id).catch(() => null);
  return info?.name ? `analysis "${info.name}"` : `analysis ${id}`;
}

/**
 * @description Builds the confirmation text. Exported so the wording is
 * assertable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * Names both consequences. The script is stored with the analysis, so it dies
 * with it. And scheduling lives in Actions — an Action of type `interval` whose
 * `action.script` targets an analysis id — a relationship that is invisible from
 * the analysis side, so an operator would not otherwise know an automation is
 * about to stop firing.
 */
function buildDeleteMessage(target: string): string {
  return `Permanently delete ${target}? Its script is deleted with it, and any Action that runs this analysis will stop firing.`;
}

async function analysisDelete(idArg: string | undefined, options: IOptions) {
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
    // See the note in analysis-info.ts on the Account/Resources cast.
    const picked = await pickAnalysisFromTagoIO(resources as unknown as Account);
    id = picked?.id;
  }

  // Destructive op: confirm unless --silent or -y.
  if (!options.silent && !options.yes) {
    const target = await describeTarget(resources, id as string);
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: buildDeleteMessage(target),
      initial: false,
    });
    if (confirm !== true) {
      successMSG("Cancelled. No changes made.");
      return;
    }
  }

  await resources.analysis.delete(id as string).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to delete analysis ${id}: ${message}`, "delete_failed", options.json);
  });

  if (options.json) {
    // `analysis.delete` resolves a plain string, so the ack is synthesized.
    process.stdout.write(`${JSON.stringify({ id, deleted: true })}\n`);
    return;
  }

  successMSG(`Analysis ${id} deleted.`);
}

export { analysisDelete, buildDeleteMessage, describeTarget };
