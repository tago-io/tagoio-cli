import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { executeMove } from "./move.js";
import { resolveResources } from "../../lib/resolve-resources.js";

interface RenameOptions {
  environment?: string;
  token?: string;
  /** Skip the confirmation prompt for folder-wide renames (CI/CD). */
  yes?: boolean;
  silent?: boolean;
}

/** Replaces the last segment of `path` with `newName`, keeping the parent dir. */
function renameDestination(path: string, newName: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? newName : `${trimmed.slice(0, slash)}/${newName}`;
}

/** Renames a file or folder in place — keeps the parent directory, changes the last segment. */
async function filesRenameCommand(path: string, newName: string, options: RenameOptions) {
  if (newName.includes("/")) {
    errorHandler(`New name must not contain '/'. Use 'tagoio files-move' to move across directories.`);
  }

  const { resources } = resolveResources(options);
  const to = renameDestination(path, newName);

  infoMSG(`Renaming ${path} -> ${to} ...`);
  const moved = await executeMove({ resources, from: path, to, skipConfirm: Boolean(options.yes || options.silent) });

  if (moved > 0) {
    successMSG(`Renamed ${moved} file(s).`);
  }
}

export { filesRenameCommand, renameDestination };
