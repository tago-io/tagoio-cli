import { type ActionQuery, Resources } from "@tago-io/sdk";
import kleur from "kleur";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, successMSG } from "../../lib/messages.js";
import { mapDate, mapTags } from "../devices/device-list.js";

/**
 * @description Formats `last_triggered`, which the SDK types as
 * `ExpireTimeOption` — `"never" | Date`. The API really does return the literal
 * string "never" for an action that has never fired, and `mapDate` would call
 * `toLocaleDateString` on it. Pass the sentinel through untouched and only
 * format real dates.
 */
function mapLastTriggered(value: unknown, options: { raw?: boolean }): string {
  // The API omits the field entirely for an action that never fired; normalize
  // both that and the explicit sentinel to "never" so machine readers always
  // find the key present.
  if (value === "never" || value === undefined || value === null) {
    return "never";
  }
  return mapDate(value as Date, options) ?? "never";
}

/**
 * A single entry of the query's tag filter.
 *
 * The SDK types this as a full `TagsObj` (both `key` and `value` required),
 * but the API accepts filtering on a key alone or a value alone — which is
 * what the repeatable `-k` / `-v` flags are for. `device-list.ts` hits the same
 * mismatch and works around it by typing its filter loosely; here the partial
 * shape is named so the cast at the assignment site stays narrow.
 */
type TagFilter = { key?: string; value?: string };

interface IOptions {
  environment?: string;
  tagkey: string[];
  tagvalue: string[];
  name?: string;
  active?: boolean;
  inactive?: boolean;
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
 * @description Zips the repeatable `-k`/`-v` flags into the query's tag filter,
 * pairing them by index.
 *
 * Deliberately not reusing `repeatableTags` from `device-list.ts`: that helper
 * is private to its module, typed to `DeviceQuery`, and loops to `<= maxRows`,
 * which appends a trailing empty tag object. Extracting a shared, corrected
 * version for both families is a worthwhile follow-up, but changing a helper
 * the device commands depend on is out of scope here.
 */
function buildTagFilter(keys: string[], values: string[]): TagFilter[] | undefined {
  const maxRows = Math.max(keys.length, values.length);
  if (maxRows === 0) {
    return undefined;
  }

  const tags: TagFilter[] = [];
  for (let i = 0; i < maxRows; i++) {
    const tag: TagFilter = {};
    if (keys[i]) {
      tag.key = keys[i];
    }
    if (values[i]) {
      tag.value = values[i];
    }
    tags.push(tag);
  }
  return tags;
}

async function actionList(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  if (options.active && options.inactive) {
    failWith("Pass only one of --active or --inactive.", "conflicting_flags", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // 200 is the Scale plan's ceiling for Actions, so a single page always holds
  // every action the profile can have.
  const query: ActionQuery = {
    amount: 200,
    fields: ["id", "name", "active", "type", "last_triggered", "tags"],
    filter: {},
  };

  if (query.filter && options.name) {
    query.filter.name = `*${options.name}*`;
  }
  if (query.filter && (options.active || options.inactive)) {
    query.filter.active = Boolean(options.active);
  }

  const tags = buildTagFilter(options.tagkey, options.tagvalue);
  if (query.filter && tags) {
    // See the TagFilter note: a key-only or value-only filter entry is valid at
    // the API but not expressible in the SDK's TagsObj-typed filter.
    query.filter.tags = tags as NonNullable<typeof query.filter.tags>;
  }

  const actions = await resources.actions.list(query).catch(errorHandler);
  if (!actions) {
    return;
  }

  const machineMode = Boolean(options.json || options.stringify);
  const resultList = actions.map((action) => ({
    ...action,
    tags: machineMode ? mapTags(action.tags ?? [], options) : (action.tags?.length ?? 0),
    last_triggered: mapLastTriggered(action.last_triggered, options),
  }));

  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(resultList, null, 2)}\n`);
  } else if (options.json) {
    process.stdout.write(`${JSON.stringify(resultList)}\n`);
  } else {
    console.table(resultList);
  }

  successMSG(`${kleur.cyan(actions.length)} actions found.`);
}

export { actionList, buildTagFilter, mapLastTriggered };
