import { resolveResources } from "../../lib/resolve-resources.js";

interface ListOptions {
  environment?: string;
  token?: string;
  /** Emit a JSON object on stdout for machine readers. */
  json?: boolean;
}

/** Lists files and folders under a path in TagoIO Files. */
async function filesListCommand(path: string | undefined, options: ListOptions) {
  const { resources } = resolveResources(options);

  // The API only returns a folder's contents when the path ends with a slash;
  // normalize a non-empty path so `files-list custom-widgets` lists its contents.
  const rawPath = path ?? "";
  const listPath = rawPath === "" || rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
  const result = await resources.files.list({ path: listPath });

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ folders: result.folders, files: result.files })}\n`);
    return;
  }

  for (const folder of result.folders) {
    process.stdout.write(`${folder}/\n`);
  }
  for (const file of result.files) {
    process.stdout.write(`${file.filename}\n`);
  }
}

export { filesListCommand };
