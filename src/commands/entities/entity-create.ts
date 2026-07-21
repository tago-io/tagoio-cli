import { readFileSync } from "node:fs";
import { Resources, type EntityCreateInfo, type TagsObj } from "@tago-io/sdk";
import prompts from "prompts";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";

interface IOptions {
  environment?: string;
  schema?: string;
  schemaJson?: string;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

/** Parses a `key:value,key2:value2` tag string into the SDK shape. */
function parseTagsCSV(input: string): TagsObj[] {
  return input
    .split(",")
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [key, ...rest] = pair.split(":");
      return { key: key.trim(), value: rest.join(":").trim() };
    });
}

/**
 * @description Loads the entity definition from `--schema <file>` or
 * `--schema-json '<inline>'`. Accepts two shapes:
 *   1. A full envelope: `{ name, schema: {...}, tags? }`
 *   2. A bare schema map: `{ field_name: {type: "string", ...}, ... }`
 *      — wrapped into `{ schema: <parsed> }` so the API receives the columns.
 *      Detected when none of the values look like an EntityCreateInfo field
 *      (i.e. no `schema` key is present at the top level).
 */
function loadSchemaPayload(options: IOptions): EntityCreateInfo | undefined {
  if (options.schema && options.schemaJson) {
    failWith("--schema and --schema-json are mutually exclusive — pass only one.", "schema_conflict", Boolean(options.json));
  }
  const raw = options.schemaJson ?? (options.schema ? readFileSync(options.schema, "utf8") : undefined);
  if (!raw) {
    return undefined;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failWith(`Failed to parse entity schema JSON: ${message}`, "schema_parse_failed", Boolean(options.json));
  }
  // Envelope vs. bare schema map: if no reserved envelope key is present, the
  // whole object is the schema. This matches `--add-field`'s bare-map shape
  // and avoids silently dropping schema columns when callers omit the
  // envelope.
  const envelopeKeys = ["name", "schema", "tags", "payload_decoder"] as const;
  const isEnvelope = envelopeKeys.some((key) => key in parsed);
  if (!isEnvelope) {
    return { schema: parsed } as unknown as EntityCreateInfo;
  }
  return parsed as unknown as EntityCreateInfo;
}

async function entityCreate(nameArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", Boolean(options.json));
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  // Flag short-circuit: schema file/inline bypasses every prompt.
  const fromFlag = loadSchemaPayload(options);
  let payload: EntityCreateInfo;

  if (fromFlag) {
    payload = fromFlag;
    if (nameArg && !payload.name) {
      payload.name = nameArg;
    }
    if (!payload.name) {
      failWith("Schema payload is missing required field: name.", "missing_name", Boolean(options.json));
    }
  } else {
    // Interactive: prompt for name → tags → paste schema JSON.
    const name = await requireOrFail(nameArg, "name", {
      silent: options.silent,
      json: options.json,
      promptMessage: "Entity name:",
    });
    let tags: TagsObj[] | undefined;
    let schema: EntityCreateInfo["schema"] | undefined;
    if (!options.silent) {
      const tagAnswer = await prompts({ type: "text", name: "tags", message: "Tags as key:value,key2:value2 (optional):" });
      tags = tagAnswer.tags ? parseTagsCSV(String(tagAnswer.tags)) : undefined;
      const schemaAnswer = await prompts({
        type: "text",
        name: "schema",
        message: "Paste schema JSON (or leave empty to skip):",
      });
      if (schemaAnswer.schema) {
        try {
          schema = JSON.parse(String(schemaAnswer.schema));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failWith(`Failed to parse pasted schema JSON: ${message}`, "schema_parse_failed", Boolean(options.json));
        }
      }
    }
    payload = { name, ...(tags ? { tags } : {}), ...(schema ? { schema } : {}) };
  }

  const created = await resources.entities.create(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    failWith(`Failed to create entity: ${message}`, "create_failed", Boolean(options.json));
  });

  if (!created) {
    return;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ id: created.id, name: payload.name })}\n`);
    return;
  }

  successMSG(`Entity created: ${payload.name} [${created.id}].`);
}

export { entityCreate };
