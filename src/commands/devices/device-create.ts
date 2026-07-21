import { Resources, type TagsObj } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";

interface IOptions {
  environment?: string;
  type?: "mutable" | "immutable";
  network?: string;
  connector?: string;
  serie?: string;
  description?: string;
  chunkPeriod?: "day" | "week" | "month" | "quarter";
  chunkRetention?: number;
  tagkey?: string[];
  tagvalue?: string[];
  inactive?: boolean;
  silent?: boolean;
  json?: boolean;
}

/** Max chunk retention allowed by the API per chunk period. */
const CHUNK_RETENTION_MAX = { day: 31, week: 26, month: 36, quarter: 36 } as const;

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

/** Zips the repeatable `--tagkey`/`--tagvalue` arrays into the SDK tag shape, by index. */
function buildTags(keys?: string[], values?: string[]): TagsObj[] | undefined {
  if (!keys?.length) {
    return undefined;
  }
  return keys.map((key, index) => ({ key, value: values?.[index] ?? "" }));
}

async function deviceCreate(nameArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", Boolean(options.json));
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const requireOpts = { silent: options.silent, json: options.json };
  const name = await requireOrFail(nameArg, "name", { ...requireOpts, promptMessage: "Device name:" });
  const type = options.type ?? "mutable";
  const network = await requireOrFail(options.network, "network", { ...requireOpts, promptMessage: "Network ID:" });
  const connector = await requireOrFail(options.connector, "connector", { ...requireOpts, promptMessage: "Connector ID:" });

  // Immutable devices require a chunk policy; the API rejects them otherwise,
  // so fail early with an actionable message instead of a generic API error.
  if (type === "immutable" && (!options.chunkPeriod || options.chunkRetention === undefined)) {
    failWith(
      "Immutable devices require --chunk-period and --chunk-retention.",
      "missing_chunk_config",
      Boolean(options.json),
    );
  }

  if (options.chunkPeriod && options.chunkRetention !== undefined) {
    const max = CHUNK_RETENTION_MAX[options.chunkPeriod];
    if (options.chunkRetention < 0 || options.chunkRetention > max) {
      failWith(`--chunk-retention for --chunk-period ${options.chunkPeriod} must be between 0 and ${max}.`, "invalid_chunk_retention", Boolean(options.json));
    }
  }

  const tags = buildTags(options.tagkey, options.tagvalue);

  const payload = {
    name,
    type,
    network,
    connector,
    active: !options.inactive,
    ...(options.serie ? { serie_number: options.serie } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(type === "immutable" ? { chunk_period: options.chunkPeriod, chunk_retention: options.chunkRetention } : {}),
    ...(tags ? { tags } : {}),
  };

  const created = await resources.devices.create(payload as never).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to create device: ${message}`, "create_failed", Boolean(options.json));
  });

  if (!created) {
    return;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: created.device_id, name, token: created.token })}\n`);
    return;
  }

  successMSG(`Device created: ${name} [${created.device_id}].`);
}

export { deviceCreate, buildTags };
