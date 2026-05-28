import { Resources } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";

interface IOptions {
  environment?: string;
  from?: string;
  to?: string;
  qty?: number;
  silent?: boolean;
  json?: boolean;
}

const DEFAULT_PAGE = 10000;

function failWith(message: string, code: string, useJSON: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(message);
}

/**
 * @description Streams data from `--from` entity into `--to` entity, paging
 * by `--qty` (default 10000). Both entities must already exist on the target
 * profile and have compatible schemas — v1 does not migrate. SDK errors on
 * incompatible writes surface verbatim via `errorHandler`.
 */
async function entityCopy(options: IOptions) {
  const useJSON = Boolean(options.json);

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", useJSON);
  }

  const fromId = await requireOrFail(options.from, "from", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Entity id to copy FROM:",
  });
  const toId = await requireOrFail(options.to, "to", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Entity id to copy TO:",
  });

  if (fromId === toId) {
    failWith("--from and --to refer to the same entity; refusing to copy onto itself.", "self_copy", useJSON);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  const pageSize = options.qty ?? DEFAULT_PAGE;
  let total = 0;
  let page = 0;

  // Loop until the source is exhausted (page returns fewer than pageSize records).
  while (true) {
    const batch = await resources.entities
      .getEntityData(fromId, { amount: pageSize, skip: page * pageSize })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return failWith(`Failed to read source entity ${fromId}: ${message}`, "read_failed", useJSON);
      });

    if (!batch || batch.length === 0) {
      break;
    }

    // Strip server-managed fields before sending — the destination assigns new
    // ids/timestamps. Leaving created_at/updated_at in the payload caused the
    // API to accept the records but discard every user-defined field (verified
    // live against the TagoIO API).
    const payload = batch.map(({ id: _id, created_at: _ca, updated_at: _ua, ...rest }) => rest);
    await resources.entities.sendEntityData(toId, payload as never).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return failWith(`Failed to write to target entity ${toId}: ${message}`, "write_failed", useJSON);
    });

    total += batch.length;
    page += 1;

    if (batch.length < pageSize) {
      break;
    }
  }

  if (useJSON) {
    process.stdout.write(`${JSON.stringify({ from: fromId, to: toId, copied: total })}\n`);
    return;
  }

  successMSG(`Copied ${total} record(s) from ${fromId} to ${toId}.`);
}

export { entityCopy };
