import { Resources, type SecretsQuery } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { buildTagFilter } from "../actions/action-list.js";
import { mapDate } from "../devices/device-list.js";

interface IOptions {
  environment?: string;
  key?: string;
  tagkey?: string[];
  tagvalue?: string[];
  amount?: number;
  stringify?: boolean;
  json?: boolean;
  raw?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Formats a timestamp that may arrive as either a `Date` or an ISO
 * string.
 *
 * `secrets.list` does not run the SDK's `dateParser` while `secrets.info` does,
 * so the same field is a string from one call and a `Date` from the other —
 * even though `SecretsInfo` types both as `Date`. `mapDate` calls
 * `.toISOString()` unguarded, so a string reaching it throws a `TypeError`.
 * This is the same shape as `mapLastTriggered` in `action-list.ts`, which fixed
 * the equivalent bug there.
 */
function mapSecretDate(value: unknown, options: { raw?: boolean }): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return options.raw ? value : mapDate(new Date(value), options);
  }
  return mapDate(value as Date, options);
}

async function secretList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // The SDK defaults to 20, so the wider default is passed explicitly.
  const query: SecretsQuery = {
    amount: options.amount ?? 100,
    fields: ["id", "key", "tags", "value_length", "created_at", "updated_at"],
    filter: {},
  };

  if (query.filter && options.key) {
    query.filter.key = `*${options.key}*`;
  }

  // `SecretsQuery` types only `key` as filterable, but the API honours a tag
  // filter too — verified against a live profile. Every other family exposes
  // -k/-v, so following the narrower type would leave secrets the odd one out.
  const tags = buildTagFilter(options.tagkey ?? [], options.tagvalue ?? []);
  if (query.filter && tags) {
    query.filter.tags = tags as NonNullable<typeof query.filter.tags>;
  }

  const secrets = await resources.secrets.list(query).catch(errorHandler);
  if (!secrets) {
    return;
  }

  const machineMode = Boolean(options.json || options.stringify);
  const resultList = secrets.map((secret) => ({
    ...secret,
    tags: machineMode ? secret.tags : (secret.tags?.length ?? 0),
    created_at: mapSecretDate(secret.created_at, options),
    updated_at: mapSecretDate(secret.updated_at, options),
  }));

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(secrets.length)} secrets found.`);
}

export { mapSecretDate, secretList };
