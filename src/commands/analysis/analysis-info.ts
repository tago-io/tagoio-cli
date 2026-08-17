import { type Account, Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";
import { pickAnalysisFromTagoIO } from "../../prompt/pick-analysis-from-tagoio.js";
import { mapLastTriggered } from "../actions/action-list.js";
import { mapDate, mapTags } from "../devices/device-list.js";

interface IOptions {
  environment?: string;
  json?: boolean;
  raw?: boolean;
  silent?: boolean;
  showToken?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

async function analysisInfo(idArg: string | undefined, options: IOptions) {
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
    // `pickAnalysisFromTagoIO` is typed for the deprecated `Account` class, which
    // every other command in this directory still uses. Probed: `Account.analysis`
    // and `Resources.analysis` return byte-identical results, and only
    // `.analysis.list` is touched here — so the cast is safe and avoids either
    // changing a signature two shipped commands depend on, or adding a third
    // near-identical picker to src/prompt/.
    const picked = await pickAnalysisFromTagoIO(resources as unknown as Account);
    id = picked?.id;
  }

  const info = await resources.analysis.info(id as string).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Analysis with id ${id} not found: ${message}`, "not_found", options.json);
  });

  if (!info) {
    return;
  }

  // The token authenticates as the analysis, and unlike the secret and run-user
  // families the credential arrives from the API on every call — so the risk here
  // is printing it, not echoing back something typed in. Dropped unless
  // --show-token asks for it, and dropped by omission rather than masked: a
  // "***" placeholder in --json is something a script might parse and try to use.
  const { token, ...withoutToken } = info as typeof info & { token?: string };
  const visible = options.showToken ? { ...withoutToken, token } : withoutToken;

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        ...visible,
        last_run: mapLastTriggered(info.last_run, options),
        created_at: mapDate(info.created_at, options),
        updated_at: mapDate(info.updated_at, options),
      })}\n`,
    );
    return;
  }

  // Human view goes entirely to stderr. `console.table` writes to stdout, which
  // is reserved for machine-readable output — the leak that shipped in
  // `action-info` and was caught only by a functional test.
  infoMSG(`Analysis Found: ${info.name} [${info.id}].`);
  const scalars: Record<string, unknown> = {
    name: info.name,
    id: info.id,
    active: info.active,
    run_on: info.run_on,
    runtime: info.runtime,
    file_name: info.file_name,
    version: info.version,
    description: info.description,
    tags: info.tags?.length ?? 0,
    variables: Array.isArray(info.variables) ? info.variables.length : 0,
    last_run: mapLastTriggered(info.last_run, options),
    created_at: mapDate(info.created_at, options),
    updated_at: mapDate(info.updated_at, options),
    ...(options.showToken ? { token } : {}),
  };
  const width = Math.max(...Object.keys(scalars).map((key) => key.length));
  for (const [key, value] of Object.entries(scalars)) {
    writeStatus(`  ${key.padEnd(width)}  ${value ?? ""}`);
  }

  if (info.tags?.length) {
    infoMSG("Tags:");
    writeStatus(JSON.stringify(mapTags(info.tags, options), null, 2));
  }
}

export { analysisInfo };
