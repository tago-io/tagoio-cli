import { Resources, type EntityDataQuery, type EntityUnknownData } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { pickEntityIDFromTagoIO } from "../../prompt/pick-entity-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  qty?: number;
  skip?: number;
  orderBy?: string;
  order?: "asc" | "desc";
  query?: string[];
  json?: boolean;
  stringify?: boolean;
  post?: string;
  edit?: string;
  delete?: string;
  empty?: boolean;
  count?: boolean;
  silent?: boolean;
}

type Mode = "read" | "post" | "edit" | "delete" | "empty" | "count";

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

/**
 * @description Resolves the operation mode from the mutually-exclusive flags.
 * Errors out when more than one is set. Defaults to `read` when none is set.
 */
function resolveMode(options: IOptions): Mode {
  const set: Mode[] = [];
  if (options.post !== undefined) {
    set.push("post");
  }
  if (options.edit !== undefined) {
    set.push("edit");
  }
  if (options.delete !== undefined) {
    set.push("delete");
  }
  if (options.empty === true) {
    set.push("empty");
  }
  if (options.count === true) {
    set.push("count");
  }

  if (set.length > 1) {
    return failWith(
      `Only one of --post, --edit, --delete, --empty, --count may be passed at a time (got: ${set.join(", ")}).`,
      "mode_conflict",
      Boolean(options.json),
    );
  }
  return set[0] ?? "read";
}

/** Parses repeatable `-q field=value` into a flat filter object. */
function parseQueryFilters(query: string[] | undefined): Record<string, string> | undefined {
  if (!query || query.length === 0) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const pair of query) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      continue;
    }
    out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseJSON<T>(raw: string, flagName: string, useJSON: boolean): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failWith(`Failed to parse ${flagName} JSON: ${message}`, "json_parse_failed", useJSON);
  }
}

async function confirmDestructive(message: string, useSilent: boolean | undefined): Promise<boolean> {
  if (useSilent) {
    return true;
  }
  const { confirm } = await prompts({ type: "confirm", name: "confirm", message, initial: false });
  return confirm === true;
}

function writeJSON(payload: unknown, options: IOptions): void {
  if (options.stringify) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
}

async function entityData(idArg: string | undefined, options: IOptions) {
  const useJSON = Boolean(options.json);
  const mode = resolveMode(options);

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", useJSON);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  let id = idArg;
  if (!id) {
    if (options.silent) {
      failWith("Missing required input: id", "missing_input", useJSON);
    }
    id = await pickEntityIDFromTagoIO(resources);
  }

  switch (mode) {
    case "read": {
      const queryParams: EntityDataQuery = {};
      if (options.qty !== undefined) {
        queryParams.amount = options.qty;
      }
      if (options.skip !== undefined) {
        queryParams.skip = options.skip;
      }
      if (options.orderBy) {
        queryParams.order = `${options.orderBy},${options.order ?? "asc"}`;
      }
      const filter = parseQueryFilters(options.query);
      if (filter) {
        queryParams.filter = filter;
      }

      const data = await resources.entities.getEntityData(id, queryParams).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to read entity ${id} data: ${message}`, "read_failed", useJSON);
      });
      if (!data) {
        return;
      }

      if (options.json || options.stringify) {
        writeJSON(data, options);
        return;
      }
      console.table(data);
      successMSG(`${data.length} record(s) returned.`);
      return;
    }

    case "post": {
      const payload = parseJSON<EntityUnknownData | EntityUnknownData[]>(options.post as string, "--post", useJSON);
      const result = await resources.entities.sendEntityData(id, payload).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to insert into entity ${id}: ${message}`, "insert_failed", useJSON);
      });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, inserted: true, result })}\n`);
        return;
      }
      successMSG(`Inserted record(s) into entity ${id}.`);
      return;
    }

    case "edit": {
      const payload = parseJSON<unknown>(options.edit as string, "--edit", useJSON);
      const result = await resources.entities
        .editEntityData(id, payload as never)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return failWith(`Failed to edit entity ${id} data: ${message}`, "edit_failed", useJSON);
        });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, edited: true, result })}\n`);
        return;
      }
      successMSG(`Edited record(s) in entity ${id}.`);
      return;
    }

    case "delete": {
      // --delete accepts a JSON array of IDs OR a comma-separated string of IDs.
      const raw = options.delete as string;
      let ids: string[];
      if (raw.trim().startsWith("[")) {
        ids = parseJSON<string[]>(raw, "--delete", useJSON);
      } else {
        ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (ids.length === 0) {
        failWith("--delete requires at least one record id.", "empty_ids", useJSON);
      }
      const ok = await confirmDestructive(`Delete ${ids.length} record(s) from entity ${id}?`, options.silent);
      if (!ok) {
        infoMSG("Cancelled. No changes made.");
        return;
      }
      const result = await resources.entities
        .deleteEntityData(id, { ids })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return failWith(`Failed to delete entity ${id} records: ${message}`, "delete_failed", useJSON);
        });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, deleted: ids.length, result })}\n`);
        return;
      }
      successMSG(`Deleted ${ids.length} record(s) from entity ${id}.`);
      return;
    }

    case "empty": {
      const ok = await confirmDestructive(`Permanently empty entity ${id} (deletes ALL records)?`, options.silent);
      if (!ok) {
        infoMSG("Cancelled. No changes made.");
        return;
      }
      const result = await resources.entities.emptyEntityData(id).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to empty entity ${id}: ${message}`, "empty_failed", useJSON);
      });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, emptied: true, result })}\n`);
        return;
      }
      successMSG(`Entity ${id} emptied.`);
      return;
    }

    case "count": {
      // SDK's `amount()` currently returns 0 for entities that clearly have
      // data (verified live against the TagoIO API). Counting via the data
      // endpoint keeps `--count` consistent with what `entity-data` itself
      // returns. The page-size cap (10000) matches `entity-copy`'s default.
      const data = await resources.entities
        .getEntityData(id, { amount: 10000 })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return failWith(`Failed to count entity ${id}: ${message}`, "count_failed", useJSON);
        });
      const count = Array.isArray(data) ? data.length : 0;
      if (useJSON || options.stringify) {
        writeJSON({ id, count }, options);
        return;
      }
      // Scalar value mode: print the bare count to stdout for `$(tagoio entity-data ... --count)`.
      process.stdout.write(`${count}\n`);
      return;
    }
  }
}

export { entityData };
