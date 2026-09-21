import { type AnalysisCreateInfo, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { buildTags } from "../devices/device-create.js";
import { assertRunOn } from "./analysis-list.js";
import { parseAnalysisVariables } from "./analysis-variables.js";

/**
 * Every runtime the API accepts, probed against a live profile.
 *
 * Deliberately wider than the SDK's `SnippetRuntime`, which lists only five —
 * it describes the runtimes with code snippets, not the ones an analysis can
 * run on.
 */
const RUNTIMES = ["node", "python", "node-legacy", "python-legacy", "deno-rt2025", "node-rt2025", "python-rt2025", "other"] as const;

/**
 * The API defaults to `node-legacy`. Inheriting that silently would put every
 * analysis created through the CLI on the legacy runtime, so this picks the
 * current one instead. Stated in `--help` and echoed by `--json`.
 */
const DEFAULT_RUNTIME = "node-rt2025";

interface IOptions {
  environment?: string;
  description?: string;
  runtime?: string;
  runOn?: string;
  inactive?: boolean;
  var?: string[];
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

async function analysisCreate(nameArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.runtime && !RUNTIMES.includes(options.runtime as (typeof RUNTIMES)[number])) {
    failWith(`Invalid --runtime "${options.runtime}". Use one of: ${RUNTIMES.join(", ")}.`, "invalid_runtime", options.json);
  }

  assertRunOn(options.runOn, options);

  // Parsed before the API call so a malformed pair costs no round trip.
  const variables = parseAnalysisVariables(options.var ?? [], options);

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const name = await requireOrFail(nameArg, "name", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Analysis name:",
  });

  const runOn = (options.runOn ?? "tago") as "tago" | "external";
  const runtime = (options.runtime ?? DEFAULT_RUNTIME) as AnalysisCreateInfo["runtime"];
  const active = !options.inactive;

  // `active` is declared `active?: true`, so `false` needs the cast. Probed: the
  // API accepts it and `info` reads the analysis back as inactive.
  //
  // `variables` is declared as a single `{ key, value }` object; the API demands
  // an array of string-valued pairs. Both casts are the narrowest way to express
  // what the endpoint actually supports.
  //
  // No duplicate-name pre-check: probed, two analyses with the same name both
  // create successfully. Unlike secrets and run users, duplicates are legitimate
  // here, so refusing one would break a real workflow.
  const payload = {
    name,
    runtime,
    run_on: runOn,
    active,
    ...(options.description ? { description: options.description } : {}),
    ...(variables ? { variables } : {}),
    ...(buildTags(options.tagkey, options.tagvalue) ? { tags: buildTags(options.tagkey, options.tagvalue) } : {}),
  } as unknown as AnalysisCreateInfo;

  const created = await resources.analysis.create(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to create analysis ${name}: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  // The token is reported as a boolean, never as a value. Probed: it is empty
  // whenever `run_on` is `tago` — the default — so printing the field would
  // usually show nothing and occasionally leak a credential into CI logs.
  const tokenPresent = Boolean(created.token);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: created.id, name, runtime, run_on: runOn, active, token_present: tokenPresent })}\n`);
    return;
  }

  successMSG(`Analysis created: ${name} [${created.id}] (${runtime}, ${runOn}).`);
  if (tokenPresent) {
    successMSG(`It has an analysis token — read it with: tagoio analysis-info ${created.id} --show-token`);
  }
}

export { analysisCreate, DEFAULT_RUNTIME, RUNTIMES };
