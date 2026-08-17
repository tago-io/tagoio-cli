import { type Account, type AnalysisInfo, type RunTypeOptions, Resources } from "@tago-io/sdk";
import { gunzipSync } from "node:zlib";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { pickAnalysisFromTagoIO } from "../../prompt/pick-analysis-from-tagoio.js";
import { buildTagPairs, mergeTags } from "../devices/device-edit.js";
import { assertRunOn } from "./analysis-list.js";
import { RUNTIMES } from "./analysis-create.js";
import { type AnalysisVariable, parseAnalysisVariables } from "./analysis-variables.js";

/**
 * The patch shape the API actually accepts, which `Partial<AnalysisInfo>` cannot
 * express. Both widenings were probed against a live profile:
 *
 *   - `active` is declared `active?: true`, but `false` is accepted and reads
 *     back as inactive
 *   - `variables` is declared as a single `{ key, value }` object, but the API
 *     demands an array and refuses the object outright
 */
type AnalysisEditPatch = Partial<Omit<AnalysisInfo, "active" | "variables">> & {
  active?: boolean;
  variables?: AnalysisVariable[];
};

interface IOptions {
  environment?: string;
  name?: string;
  description?: string;
  runtime?: string;
  runOn?: string;
  activate?: boolean;
  deactivate?: boolean;
  var?: string[];
  clearVars?: boolean;
  tagkey?: string[];
  tagvalue?: string[];
  mergeTags?: boolean;
  silent?: boolean;
  json?: boolean;
}

/**
 * @description Re-uploads an analysis' existing script under a different
 * language, which is the only way to change its runtime.
 *
 * Probed against a live profile: the runtime follows the `language` of the last
 * upload, and a PUT carrying `runtime` never takes effect on its own — an upload
 * declaring `node-rt2025` even overrode a PUT asking for `deno-rt2025`.
 *
 * `downloadScript` resolves a URL to a gzipped body rather than the source, so
 * the fetch and gunzip here mirror what `duplicate-analysis` already does.
 */
async function changeRuntime(resources: Resources, id: string, runtime: string, options: IOptions) {
  const info = await resources.analysis.info(id);

  if (info.runtime === runtime) {
    return false;
  }

  const download = await resources.analysis.downloadScript(id).catch(() => null);
  if (!download?.url) {
    // Probed: the API answers "Analysis file can't be found" for an analysis
    // that never had a script. There is nothing to re-upload, so the runtime
    // cannot be changed this way.
    failWith(
      `Analysis ${id} has no script to re-upload, so its runtime cannot be changed. Deploy a script first with 'analysis-deploy', or create a new analysis with --runtime.`,
      "no_script",
      options.json,
    );
  }

  const response = await fetch(download.url);
  const body = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8");

  await resources.analysis
    .uploadScript(id, {
      name: info.file_name || "script.js",
      content: Buffer.from(body).toString("base64"),
      language: runtime as RunTypeOptions,
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Failed to change the runtime of analysis ${id}: ${message}`, "edit_failed", options.json);
    });

  return true;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function analysisEdit(idArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.activate && options.deactivate) {
    failWith("--activate and --deactivate cannot be used together.", "conflicting_flags", options.json);
  }

  if (options.clearVars && options.var?.length) {
    failWith("--clear-vars and --var cannot be used together.", "conflicting_flags", options.json);
  }

  if (options.runtime && !RUNTIMES.includes(options.runtime as (typeof RUNTIMES)[number])) {
    failWith(`Invalid --runtime "${options.runtime}". Use one of: ${RUNTIMES.join(", ")}.`, "invalid_runtime", options.json);
  }

  assertRunOn(options.runOn, options);

  // Parsed before any API call so a malformed pair costs no round trip.
  const variables = parseAnalysisVariables(options.var ?? [], options);

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", options.json);
    }
    // See the note in analysis-info.ts: the existing picker is typed for the
    // deprecated `Account` class, and probing showed the two surfaces are
    // identical for `.analysis`.
    const picked = await pickAnalysisFromTagoIO(resources as unknown as Account);
    id = picked?.id;
  }

  const patch: AnalysisEditPatch = {};

  if (options.name !== undefined) {
    patch.name = options.name;
  }

  // An empty string is a deliberate clear, not an absent flag. Probed: `null`
  // round-trips and reads back as null.
  if (options.description !== undefined) {
    patch.description = options.description || null;
  }

  if (options.runOn) {
    patch.run_on = options.runOn as "tago" | "external";
  }

  if (options.activate || options.deactivate) {
    patch.active = Boolean(options.activate);
  }

  if (options.clearVars) {
    patch.variables = [];
  } else if (variables) {
    patch.variables = variables;
  }

  if (options.tagkey?.length) {
    const incoming = buildTagPairs(options.tagkey, options.tagvalue);
    if (options.mergeTags) {
      // Only the merge path reads first — a replace must not pay for a lookup it
      // does not use.
      const info = await resources.analysis.info(id as string);
      patch.tags = mergeTags(info?.tags ?? [], incoming);
    } else {
      patch.tags = incoming;
    }
  }

  // Runs before the patch is evaluated, since --runtime alone is a valid edit
  // that sends no patch at all.
  const runtimeChanged = options.runtime ? await changeRuntime(resources, id as string, options.runtime, options) : false;

  if (Object.keys(patch).length === 0 && !runtimeChanged) {
    failWith("Nothing to update — pass a field to change, --runtime, --clear-vars, or tags.", "no_changes", options.json);
  }

  if (Object.keys(patch).length > 0) {
    await resources.analysis.edit(id as string, patch as Partial<AnalysisInfo>).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // The API's message only. Echoing the patch would put whatever it carries
      // into whatever captured the error.
      failWith(`Failed to edit analysis ${id}: ${message}`, "edit_failed", options.json);
    });
  }

  if (options.json) {
    // `analysis.edit` resolves a plain string ("Successfully Updated"), so the
    // ack is synthesized, as run-user-edit and secret-edit do.
    process.stdout.write(`${JSON.stringify({ id, updated: true })}\n`);
    return;
  }

  successMSG(`Analysis ${id} updated.`);
}

export { analysisEdit };
