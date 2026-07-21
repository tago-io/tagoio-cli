import type { Resources } from "@tago-io/sdk";

import { isFolderPath, listFilesRecursive, remapPrefix, runFileBatch } from "../../lib/files-paths.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { resolveResources } from "../../lib/resolve-resources.js";
import { confirmPrompt } from "../../prompt/confirm.js";

interface MoveOptions {
  environment?: string;
  token?: string;
  /** Skip the confirmation prompt for folder-wide moves (CI/CD). */
  yes?: boolean;
  silent?: boolean;
}

interface ExecuteMoveParams {
  resources: Resources;
  from: string;
  to: string;
  /** When true, never prompt (CI/CD or rename of a single file). */
  skipConfirm: boolean;
}

interface MoveResult {
  succeeded: number;
  failed: number;
  /** True when the user declined the folder-move confirmation. */
  cancelled: boolean;
}

/**
 * Moves a file or a folder prefix. A single file is one move call; a folder is
 * listed recursively and each file moved with its prefix remapped, throttled.
 * Folder moves of more than one file confirm unless `skipConfirm`. Per-file
 * failures are counted, not swallowed.
 */
async function executeMove(params: ExecuteMoveParams): Promise<MoveResult> {
  const { resources, from, to, skipConfirm } = params;

  if (!isFolderPath(from)) {
    await resources.files.move([{ from, to }]).catch((error) => {
      errorHandler(`Failed to move '${from}': ${error?.message ?? error}`);
    });
    return { succeeded: 1, failed: 0, cancelled: false };
  }

  const files = await listFilesRecursive(resources, from);
  if (files.length === 0) {
    errorHandler(`No files found under '${from}'.`);
  }

  if (files.length > 1 && !skipConfirm) {
    const ok = await confirmPrompt(`Move ${files.length} files from '${from}' to '${to}'?`);
    if (!ok) {
      infoMSG("Cancelled.");
      return { succeeded: 0, failed: 0, cancelled: true };
    }
  }

  const { succeeded, failed } = await runFileBatch(files, (filePath) => resources.files.move([{ from: filePath, to: remapPrefix(filePath, from, to) }]));

  return { succeeded, failed, cancelled: false };
}

/** Moves a file or folder prefix to a new path. */
async function filesMoveCommand(from: string, to: string, options: MoveOptions) {
  const { resources } = resolveResources(options);

  infoMSG(`Moving ${from} -> ${to} ...`);
  const { succeeded, failed, cancelled } = await executeMove({
    resources,
    from,
    to,
    skipConfirm: Boolean(options.yes || options.silent),
  });

  if (cancelled) {
    return;
  }
  if (failed > 0) {
    errorHandler(`Moved ${succeeded} file(s), ${failed} failed.`);
  }
  successMSG(`Moved ${succeeded} file(s).`);
}

export { executeMove, filesMoveCommand };
