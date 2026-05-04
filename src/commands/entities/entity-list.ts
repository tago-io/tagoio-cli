import { Resources, TagsObj } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";

interface IOptions {
  environment?: string;
  tagkey: string[];
  tagvalue: string[];
  name?: string;
  json?: boolean;
  stringify?: boolean;
  silent?: boolean;
}

/** Builds a tag filter array from repeatable -k/-v pairs. */
function buildTagFilter(keys: string[], values: string[]): TagsObj[] | undefined {
  const max = Math.max(keys.length, values.length);
  if (max === 0) {
    return undefined;
  }
  const tags: TagsObj[] = [];
  for (let i = 0; i < max; i++) {
    const tag: Partial<TagsObj> = {};
    if (keys[i]) {
      tag.key = keys[i];
    }
    if (values[i]) {
      tag.value = values[i];
    }
    tags.push(tag as TagsObj);
  }
  return tags;
}

/** Reports a SDK failure either as `[ERROR] ...` or as JSON, per --json. */
function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

async function entityList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", Boolean(options.json));
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const tags = buildTagFilter(options.tagkey ?? [], options.tagvalue ?? []);
  const filter: { name?: string; tags?: TagsObj[] } = {};
  if (options.name) {
    filter.name = `*${options.name}*`;
  }
  if (tags) {
    filter.tags = tags;
  }

  const list = await resources.entities
    .list({ amount: 100, fields: ["id", "name", "tags", "created_at", "updated_at"], filter })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      failWith(`Failed to list entities: ${message}`, "list_failed", Boolean(options.json));
    });

  if (!list) {
    return;
  }

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(list)}\n`);
    return;
  }

  console.table(list.map((x) => ({ id: x.id, name: x.name, tags: x.tags?.length ?? 0, updated_at: x.updated_at })));
  successMSG(`${list.length} entities found.`);
}

export { entityList };
