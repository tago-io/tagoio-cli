import { getApiURL } from "../../lib/config-file.js";
import { resolveResources } from "../../lib/resolve-resources.js";

interface URLOptions {
  environment?: string;
  /** Profile token for this invocation, bypassing the lock file (CI/CD). */
  token?: string;
  /** Return a signed URL for a private file. */
  signed?: boolean;
}

/**
 * Prints the URL of a file already in TagoIO Files. The URL goes to stdout so
 * it can be captured in scripts; everything else stays on stderr.
 */
async function filesURLCommand(remotePath: string, options: URLOptions) {
  const { resources, region } = resolveResources(options);
  const profile = await resources.profiles.info("current");

  const cleanPath = remotePath.replace(/^\/+/, "");
  const publicURL = `${getApiURL(region)}/file/${profile.info.id}/${cleanPath}`;

  const url = options.signed ? await resources.files.getFileURLSigned(publicURL) : publicURL;

  process.stdout.write(`${url}\n`);
}

export { filesURLCommand };
