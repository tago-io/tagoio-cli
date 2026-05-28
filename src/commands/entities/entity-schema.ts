import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, successMSG } from "../../lib/messages.js";
import { pickEntityIDFromTagoIO } from "../../prompt/pick-entity-id-from-tagoio.js";

interface IOptions {
  environment?: string;
  addField?: string;
  updateField?: string;
  renameField?: string;
  deleteField?: string;
  addIndex?: string;
  deleteIndex?: string;
  json?: boolean;
  stringify?: boolean;
  silent?: boolean;
}

type Mode = "print" | "add-field" | "update-field" | "rename-field" | "delete-field" | "add-index" | "delete-index";

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

function resolveMode(options: IOptions): Mode {
  const set: Mode[] = [];
  if (options.addField !== undefined) {
    set.push("add-field");
  }
  if (options.updateField !== undefined) {
    set.push("update-field");
  }
  if (options.renameField !== undefined) {
    set.push("rename-field");
  }
  if (options.deleteField !== undefined) {
    set.push("delete-field");
  }
  if (options.addIndex !== undefined) {
    set.push("add-index");
  }
  if (options.deleteIndex !== undefined) {
    set.push("delete-index");
  }

  if (set.length > 1) {
    return failWith(
      `Only one schema op may be passed at a time (got: ${set.join(", ")}).`,
      "mode_conflict",
      Boolean(options.json),
    );
  }
  return set[0] ?? "print";
}

function parseJSON<T>(raw: string, flagName: string, useJSON: boolean): T {
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failWith(`Failed to parse ${flagName} JSON: ${message}`, "json_parse_failed", useJSON);
  }
}

/** Splits `from:to` into [from, to], errors when malformed. */
function parseRenameSpec(spec: string, useJSON: boolean): [string, string] {
  const idx = spec.indexOf(":");
  if (idx < 1 || idx === spec.length - 1) {
    return failWith(`--rename-field expects '<from>:<to>' (got '${spec}').`, "bad_rename_spec", useJSON);
  }
  return [spec.slice(0, idx).trim(), spec.slice(idx + 1).trim()];
}

/** Top-level entry of a parsed --add-field / --add-index JSON: `{ <name>: <typedef> }`. */
function singleEntry<T>(obj: Record<string, T>, flagName: string, useJSON: boolean): [string, T] {
  const keys = Object.keys(obj);
  if (keys.length !== 1) {
    return failWith(`${flagName} JSON must have exactly one top-level key (got ${keys.length}).`, "bad_payload", useJSON);
  }
  return [keys[0], obj[keys[0]]];
}

async function confirmDestructive(message: string, useSilent: boolean | undefined): Promise<boolean> {
  if (useSilent) {
    return true;
  }
  const { confirm } = await prompts({ type: "confirm", name: "confirm", message, initial: false });
  return confirm === true;
}

async function entitySchema(idArg: string | undefined, options: IOptions) {
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
    case "print": {
      const info = await resources.entities.info(id).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to read entity ${id} schema: ${message}`, "read_failed", useJSON);
      });
      if (!info) {
        return;
      }
      const payload = { id: info.id, schema: info.schema ?? {}, index: (info as { index?: unknown }).index ?? {} };
      if (options.stringify) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
      }
      if (useJSON) {
        process.stdout.write(`${JSON.stringify(payload)}\n`);
        return;
      }
      infoMSG(`Schema for entity ${id}:`);
      console.table(payload.schema);
      if (payload.index && Object.keys(payload.index as Record<string, unknown>).length > 0) {
        infoMSG("Indexes:");
        console.table(payload.index);
      }
      return;
    }

    case "add-field": {
      const fields = parseJSON<Record<string, Record<string, unknown>>>(options.addField as string, "--add-field", useJSON);
      const [name, typedef] = singleEntry(fields, "--add-field", useJSON);
      // The TagoIO API expects an `action` discriminator per entry, even
      // though the SDK's TS types omit it. Inject the default so callers
      // don't need to remember.
      const schema = { [name]: { action: "create", ...typedef } } as Record<string, unknown>;
      await resources.entities
        .editSchemaIndex(id, { schema: schema as never })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return failWith(`Failed to add field on entity ${id}: ${message}`, "add_field_failed", useJSON);
        });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, addedField: name })}\n`);
        return;
      }
      successMSG(`Added field '${name}' to entity ${id}.`);
      return;
    }

    case "update-field": {
      const payload = parseJSON<Record<string, unknown>>(options.updateField as string, "--update-field", useJSON);
      const [name, data] = singleEntry(payload, "--update-field", useJSON);
      await resources.entities
        .updateField(id, name, data as never)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return failWith(`Failed to update field '${name}' on entity ${id}: ${message}`, "update_field_failed", useJSON);
        });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, updatedField: name })}\n`);
        return;
      }
      successMSG(`Updated field '${name}' on entity ${id}.`);
      return;
    }

    case "rename-field": {
      const [from, to] = parseRenameSpec(options.renameField as string, useJSON);
      await resources.entities.renameField(id, from, to).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to rename '${from}' → '${to}' on entity ${id}: ${message}`, "rename_field_failed", useJSON);
      });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, renamedField: { from, to } })}\n`);
        return;
      }
      successMSG(`Renamed field '${from}' → '${to}' on entity ${id}.`);
      return;
    }

    case "delete-field": {
      const name = options.deleteField as string;
      const ok = await confirmDestructive(`Delete field '${name}' from entity ${id}?`, options.silent);
      if (!ok) {
        infoMSG("Cancelled. No changes made.");
        return;
      }
      await resources.entities.deleteField(id, name).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to delete field '${name}' on entity ${id}: ${message}`, "delete_field_failed", useJSON);
      });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, deletedField: name })}\n`);
        return;
      }
      successMSG(`Deleted field '${name}' from entity ${id}.`);
      return;
    }

    case "add-index": {
      const indexes = parseJSON<Record<string, Record<string, unknown>>>(options.addIndex as string, "--add-index", useJSON);
      const [name, typedef] = singleEntry(indexes, "--add-index", useJSON);
      // API expects `action: "create"` per index entry; inject defensively.
      const index = { [name]: { action: "create", ...typedef } } as Record<string, unknown>;
      await resources.entities
        .editSchemaIndex(id, { index: index as never })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          return failWith(`Failed to add index on entity ${id}: ${message}`, "add_index_failed", useJSON);
        });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, addedIndex: name })}\n`);
        return;
      }
      successMSG(`Added index '${name}' on entity ${id}.`);
      return;
    }

    case "delete-index": {
      const name = options.deleteIndex as string;
      const ok = await confirmDestructive(`Delete index '${name}' from entity ${id}?`, options.silent);
      if (!ok) {
        infoMSG("Cancelled. No changes made.");
        return;
      }
      await resources.entities.deleteIndex(id, name).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to delete index '${name}' on entity ${id}: ${message}`, "delete_index_failed", useJSON);
      });
      if (useJSON) {
        process.stdout.write(`${JSON.stringify({ id, deletedIndex: name })}\n`);
        return;
      }
      successMSG(`Deleted index '${name}' from entity ${id}.`);
      return;
    }
  }
}

export { entitySchema };
