import { readConfigFile } from "../lib/config-file.js";
import { errorHandler } from "../lib/messages.js";
import { resolveScope } from "../lib/resolve-scope.js";
import { readToken } from "../lib/token.js";

interface WhoamiOptions {
  json?: boolean;
}

interface WhoamiPayload {
  scope: "local" | "global";
  loadedFrom: string;
  activeEnv: string;
  profileId: string;
  profileName: string;
  email: string;
  /** S3: hard-coded enum — never the token bytes. */
  token: "loaded" | "missing";
}

/**
 * @description Prints the active profile (scope, loaded path, env, identity,
 * and whether a token is present) without making any API call.
 *
 * Data goes to stdout; status goes to stderr (clig.dev). With `--json`, stdout
 * is a single JSON object so it pipes cleanly through `jq`.
 *
 * S3: the Token field is hard-coded to `"loaded"` / `"missing"`. The token
 * bytes are never read into the output payload.
 */
async function whoami(options: WhoamiOptions = {}): Promise<void> {
  const scope = resolveScope();

  if (!scope.configExists) {
    if (scope.scope === "global") {
      errorHandler(`No tagoconfig.json found. Run \`tagoio init --scope global\` to create one, or cd into a project directory.`);
    } else {
      errorHandler(`No tagoconfig.json found at ${scope.configPath}. Run \`tagoio init\` to create one.`);
    }
  }

  // Read-only: readConfigFile never auto-creates or mutates, keeping whoami
  // a pure read of the resolved config (the configExists guard above already
  // handled the missing-file case).
  const config = readConfigFile(scope.configPath);
  if (!config) {
    errorHandler(`Failed to read or parse ${scope.configPath}. Run \`tagoio init\` to recreate it.`);
  }

  const activeEnv = process.env.TAGOIO_DEFAULT ?? "";
  const envBlock = (activeEnv && config[activeEnv]) || undefined;

  const payload: WhoamiPayload = {
    scope: scope.scope,
    loadedFrom: scope.configPath,
    activeEnv: activeEnv || "(none)",
    profileId: envBlock?.id || "N/A",
    profileName: envBlock?.profileName || "N/A",
    email: envBlock?.email || "N/A",
    token: activeEnv && readToken(activeEnv) ? "loaded" : "missing",
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  // Human form: a 2-column table on stdout. Built with console.table so the
  // labels stay aligned without manual padding.
  console.table({
    Scope: payload.scope,
    "Loaded from": payload.loadedFrom,
    "Active env": payload.activeEnv,
    "Profile ID": payload.profileId,
    "Profile name": payload.profileName,
    Email: payload.email,
    Token: payload.token,
  });
}

export { whoami, WhoamiOptions, WhoamiPayload };
