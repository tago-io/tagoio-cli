import { Resources, type SQLCreateInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { buildTags } from "../devices/device-create.js";
import { parseSQLParams, resolveQuery } from "./sql-payload.js";

interface IOptions {
  environment?: string;
  query?: string;
  queryFile?: string;
  description?: string;
  param?: string[];
  cache?: boolean;
  cacheTtl?: number;
  rateLimit?: number;
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

async function sqlCreate(nameArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  // Parsed before anything else so a malformed payload costs no round trip.
  const query = resolveQuery(options);
  if (!query) {
    failWith("A query needs SQL — pass --query with the statement, or --query-file with a path.", "missing_input", options.json);
  }

  const params = parseSQLParams(options.param ?? [], options);

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const name = await requireOrFail(nameArg, "name", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Query name:",
  });

  const tags = buildTags(options.tagkey, options.tagvalue);

  // `cache_ttl_seconds` and `rate_limit_rpm` are forwarded as given: the API
  // clamps the TTL silently (probed: 99999 → 86400, −1 → 0) and enforces a plan
  // cap on the rate limit, naming its own number. Clamping locally would only
  // duplicate a rule the platform owns.
  const payload: SQLCreateInfo = {
    name,
    query,
    active: !options.inactive,
    ...(options.description ? { description: options.description } : {}),
    ...(params ? { params } : {}),
    ...(options.cache ? { cache_enabled: true } : {}),
    ...(options.cacheTtl !== undefined ? { cache_ttl_seconds: options.cacheTtl } : {}),
    ...(options.rateLimit !== undefined ? { rate_limit_rpm: options.rateLimit } : {}),
    ...(tags ? { tags } : {}),
  };

  const created = await resources.sql.create(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // The API's message is forwarded intact: it is a SQL parser, and its
    // rejections name the rule broken — `Only SELECT statements are allowed`,
    // `All tables must have an alias (use AS)` — or the plan limit hit.
    failWith(`Failed to create SQL query ${name}: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  // Every reported field comes from the response, never the request: the API
  // clamps the TTL without saying so, so echoing what was sent would report a
  // value the server never stored.
  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({
        id: created.id,
        name: created.name,
        version: created.version,
        active: created.active,
        cache_enabled: created.cache_enabled,
        cache_ttl_seconds: created.cache_ttl_seconds,
        rate_limit_rpm: created.rate_limit_rpm,
      })}\n`,
    );
    return;
  }

  successMSG(`SQL query created: ${created.name} [${created.id}] (version ${created.version}).`);
}

export { sqlCreate };
