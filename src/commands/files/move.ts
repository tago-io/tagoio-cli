import { Resources } from "@tago-io/sdk";
import { queue } from "async";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { isFolderPath, listFilesRecursive, remapPrefix } from "../../lib/files-paths.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { CONCURRENCY, DELAY_BETWEEN_REQUESTS_MS } from "../../lib/upload-folder.js";
import { confirmPrompt } from "../../prompt/confirm.js";

interface MoveOptions {
  environment?: string;
  token?: string;
  /** Skip the confirmation prompt for folder-wide moves (CI/CD). */
  yes?: boolean;
  silent?: boolean;
}

/** Resolves a Resources client from the environment + token, or errors. */
function resolveResources(options: { environment?: string; token?: string }): Resources {
  const config = getEnvironmentConfig(options.environment);
  if (!config) {
    errorHandler("Environment not found");
  }
  if (options.token) {
    config.profileToken = options.token;
  }
  if (!config.profileToken) {
    errorHandler("No profile token found. Pass --token or run 'tagoio login'.");
  }
  return new Resources({ token: config.profileToken, region: config.profileRegion });
}

interface ExecuteMoveParams {
  resources: Resources;
  from: string;
  to: string;
  /** When true, never prompt (CI/CD or rename of a single file). */
  skipConfirm: boolean;
}

/**
 * Moves a file or a folder prefix. A single file is one move call; a folder is
 * listed recursively and each file moved with its prefix remapped, throttled.
 * Folder moves of more than one file confirm unless `skipConfirm`.
 */
async function executeMove(params: ExecuteMoveParams): Promise<number> {
  const { resources, from, to, skipConfirm } = params;

  if (!isFolderPath(from)) {
    await resources.files.move([{ from, to }]);
    return 1;
  }

  const files = await listFilesRecursive(resources, from);
  if (files.length === 0) {
    errorHandler(`No files found under '${from}'.`);
  }

  if (files.length > 1 && !skipConfirm) {
    const ok = await confirmPrompt(`Move ${files.length} files from '${from}' to '${to}'?`);
    if (!ok) {
      infoMSG("Cancelled.");
      return 0;
    }
  }

  const moveQueue = queue<string>(async (filePath) => {
    await resources.files.move([{ from: filePath, to: remapPrefix(filePath, from, to) }]);
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
  }, CONCURRENCY);

  for (const filePath of files) {
    void moveQueue.push(filePath);
  }
  await moveQueue.drain();

  return files.length;
}

/** Moves a file or folder prefix to a new path. */
async function filesMoveCommand(from: string, to: string, options: MoveOptions) {
  const resources = resolveResources(options);

  infoMSG(`Moving ${from} -> ${to} ...`);
  const moved = await executeMove({ resources, from, to, skipConfirm: Boolean(options.yes || options.silent) });

  if (moved > 0) {
    successMSG(`Moved ${moved} file(s).`);
  }
}

export { executeMove, filesMoveCommand, resolveResources };
