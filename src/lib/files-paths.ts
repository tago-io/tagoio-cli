import type { Resources } from "@tago-io/sdk";

/**
 * Path helpers shared by the folder-capable files-* commands. The SDK operates
 * per file, so "folder" operations list a prefix recursively and act on each
 * file; these helpers centralize the prefix detection, listing, and remapping.
 */

/**
 * Returns true when `path` should be treated as a folder prefix rather than a
 * single file: it ends with `/`, or its last segment has no file extension.
 */
function isFolderPath(path: string): boolean {
  if (path.endsWith("/")) {
    return true;
  }
  const lastSegment = path.split("/").pop() ?? "";
  return !lastSegment.includes(".");
}

/**
 * Rewrites `filePath`'s `from` prefix to `to`, preserving the relative path and
 * the file's leading slash. Files not under `from` are returned unchanged.
 */
function remapPrefix(filePath: string, from: string, to: string): string {
  const normalizedFile = filePath.replace(/^\/+/, "");
  const normalizedFrom = from.replace(/^\/+|\/+$/g, "");

  if (normalizedFile !== normalizedFrom && !normalizedFile.startsWith(`${normalizedFrom}/`)) {
    return filePath;
  }

  const relative = normalizedFile.slice(normalizedFrom.length).replace(/^\/+/, "");
  const normalizedTo = to.replace(/^\/+|\/+$/g, "");
  const leadingSlash = filePath.startsWith("/") ? "/" : "";
  return relative ? `${leadingSlash}${normalizedTo}/${relative}` : `${leadingSlash}${normalizedTo}`;
}

/**
 * Lists every file under `prefix`, walking nested folders into a flat array of
 * filenames.
 */
async function listFilesRecursive(resources: Resources, prefix: string): Promise<string[]> {
  const { files, folders } = await resources.files.list({ path: prefix });
  const here = files.map((f) => f.filename);

  const nested = await Promise.all(folders.map((folder) => listFilesRecursive(resources, folder)));

  return [...here, ...nested.flat()];
}

export { isFolderPath, listFilesRecursive, remapPrefix };
