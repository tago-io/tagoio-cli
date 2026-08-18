import { Resources, type SQLTablesQuery } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, infoMSG, writeStatus } from "../../lib/messages.js";

interface IOptions {
  environment?: string;
  filter?: string;
  amount?: number;
  page?: number;
  entity?: string;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Lists everything a query may reference: the callable tables, the
 * allowlisted functions, and the profile's devices and entities with their ids.
 *
 * This exists so a query can be authored without the web admin. The whole
 * vocabulary is otherwise undiscoverable — the SDK types name none of the tables
 * or functions.
 */
async function sqlTables(options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const query: SQLTablesQuery = {
    ...(options.filter ? { filter: options.filter } : {}),
    ...(options.amount !== undefined ? { amount: options.amount } : {}),
    ...(options.page !== undefined ? { page: options.page } : {}),
    ...(options.entity ? { entity_id: options.entity } : {}),
  };

  const result = await resources.sql.tables(query).catch(errorHandler);
  if (!result) {
    return;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  // Human view goes entirely to stderr, like every other read command here.
  infoMSG("Tables:");
  for (const table of result.tables ?? []) {
    const tagForm = table.tag_form ? `, tag form: ${table.tag_form}` : "";
    writeStatus(`  ${table.function}()  —  ${table.label}  (${table.columns?.length ?? 0} columns${tagForm})`);

    if (!table.columns?.length) {
      // Probed: `entity` returns zero columns until `entity_id` is supplied, then
      // resolves six. Without this line an empty list reads as a broken table
      // rather than one waiting for an argument.
      writeStatus(`      columns depend on the resource — pass --entity <id> to resolve them`);
      continue;
    }
    writeStatus(`      ${table.columns.map((column) => `${column.name}:${column.type}`).join(", ")}`);
  }

  // Grouped by kind because the kinds behave differently: aggregates take a
  // column, a predicate filters, and a session function only resolves inside a
  // TagoRUN session — which is why its example matters.
  const byKind = new Map<string, typeof result.functions>();
  for (const fn of result.functions ?? []) {
    const bucket = byKind.get(fn.kind) ?? [];
    bucket.push(fn);
    byKind.set(fn.kind, bucket);
  }
  for (const [kind, fns] of byKind) {
    infoMSG(`Functions (${kind}):`);
    for (const fn of fns) {
      writeStatus(`  ${fn.name}(${(fn.args ?? []).join(", ")})  —  ${fn.description}`);
      if (fn.example) {
        // Session functions carry the COALESCE idiom, which is the part worth
        // copying rather than re-deriving.
        writeStatus(`      e.g. ${fn.example}`);
      }
    }
  }

  // The ids are here to be pasted into a `$n` param, so they are printed
  // alongside the names rather than left to a second lookup.
  if (result.resources?.devices?.length) {
    infoMSG("Devices:");
    for (const device of result.resources.devices) {
      writeStatus(`  ${device.name}  [${device.id}]`);
    }
  }

  if (result.resources?.entities?.length) {
    infoMSG("Entities:");
    for (const entity of result.resources.entities) {
      writeStatus(`  ${entity.name}  [${entity.id}]`);
    }
  }
}

export { sqlTables };
