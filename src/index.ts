#!/usr/bin/env node
import { Command } from "commander";
import dotenv from "dotenv";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import kleur from "kleur";

import { analysisCommands } from "./commands/analysis/index.js";
import { dashboardCommands } from "./commands/dashboard/index.js";
import { deviceCommands } from "./commands/devices/index.js";
import { entityCommands } from "./commands/entities/index.js";
import { filesCommands } from "./commands/files/index.js";
import { listEnvironment } from "./commands/list-env.js";
import { tagoLogin } from "./commands/login.js";
import { profileCommands } from "./commands/profile/index.js";
import { setEnvironment } from "./commands/set-env.js";
import { startConfig } from "./commands/start-config.js";
import { whoami } from "./commands/whoami.js";
import { getConfigFile } from "./lib/config-file.js";
import { configureHelp } from "./lib/configure-help.js";
import { getEnvFilePath } from "./lib/dotenv-config.js";
import { highlightMSG } from "./lib/messages.js";
import { updater } from "./lib/notify-update.js";
import { resolveScope } from "./lib/resolve-scope.js";
import { maybeShowScopeNotice } from "./lib/scope-notice.js";

const packageJSON = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
dotenv.config({ path: getEnvFilePath(), quiet: true });

const indexConfigFile = getConfigFile();
const defaultEnvironment = process.env.TAGOIO_DEFAULT || "";

/**
 * Returns a string with ANSI escape codes to display text in red.
 *
 * @param str - The string to be colored in red.
 * @returns A string with ANSI escape codes to display text in red.
 */
function errorColor(str: string) {
  // Add ANSI escape codes to display text in red.
  return `\x1b[31m${str}\x1b[0m`;
}

/**
 * @description Builds the commander program with every top-level command
 * (init / login / set-env / list-env) and every namespace (analysis,
 * devices, dashboard, profile) registered. Returns the configured program
 * without calling `program.parse()`.
 *
 * This is the single source of truth for the CLI's command surface. Both the
 * runtime entry point (`initiateCMD`) and the man-page generator
 * (`src/lib/generate-man.ts`) call it — adding a new command in this file
 * automatically appears in `tagoio --help` and in `man tagoio` on the next
 * `npm run man`.
 *
 * @param defaultEnv - Default value for the optional `[environment]`
 *   argument on `init` and `login`. Pass `""` for a user-agnostic build
 *   (e.g. man-page generation); pass the runtime selection otherwise.
 */
function buildProgram(defaultEnv: string): Command {
  const program = new Command();

  program.version(packageJSON.version).description(`${kleur.bold(`TagoIO Command Line Tools - v${packageJSON.version}`)}
  \tDefault Environment: ${highlightMSG(defaultEnv)}
  \tProfile ID: ${highlightMSG(indexConfigFile?.[defaultEnv]?.id || "N/A")}
  \tName: ${highlightMSG(indexConfigFile?.[defaultEnv]?.profileName || "N/A")}
  \tEmail: ${highlightMSG(indexConfigFile?.[defaultEnv]?.email || "N/A")}`);

  program.configureOutput({
    writeErr: (str) => process.stderr.write(`[${errorColor("ERROR")}] ${str}`),
  });

  configureHelp(program);

  program
    .command("init")
    .description("create/update the config file for analysis in your current folder")
    .argument("[environment]", "name of the environment", defaultEnv || "dev")
    .option("-t, --token <profile-token>", "profile token of the environment and skip login step")
    .option("--name <name>", "env name (alias for [environment]); flag wins if both are passed")
    .option("--scope <scope>", "force a specific profile scope: 'local' or 'global'")
    .option("--api-endpoint <url>", "API endpoint URL (must be paired with --sse-endpoint)")
    .option("--sse-endpoint <url>", "SSE endpoint URL (must be paired with --api-endpoint)")
    .option("--no-input", "fail instead of prompting; --token required for authentication")
    .option("--force", "skip the existing-configuration overwrite confirmation")
    .action(startConfig)
    .addHelpText(
      "after",
      `
    Note: If you don't store credentials with -t, you must run tagoio login.

Example:
    $ tagoio init
    $ tagoio init prod
    $ tagoio init -t eb8a1d42-0f28-4ee7-9862-839920eb1cb0
    $ tagoio init --scope global
    $ tagoio init --no-input --name dev --scope local --api-endpoint https://api.tago.io --sse-endpoint https://sse.tago.io -t TOKEN
    $ tagoio init prod --force`,
    );

  program
    .command("login")
    .description("login to your account and store profile_token in the tago-lock.")
    .argument("[environment]", "name of the environment", defaultEnv || "dev")
    .option("-u, --email <email>", "your TagoIO email")
    .option("-p, --password <password>", "your TagoIO password")
    .option("-t, --token <profile-token>", "set a profile-token for the environment and skip login step")
    .option("--scope <scope>", "force a specific profile scope: 'local' or 'global'")
    .action(tagoLogin)
    .addHelpText(
      "after",
      `
    Note: No need to login again if you already stored credentials with tagoio init

Example:
    $ tagoio login
    $ tagoio login -u tago@tago.io -p 12345678
    $ tagoio login -t eb8a1d42-0f28-4ee7-9862-839920eb1cb0
    $ tagoio login --scope global`,
    );

  program
    .command("set-env")
    .description("set your default environment from tagoconfig.ts")
    .argument("[environment]", "name of the environment")
    .action(setEnvironment)
    .addHelpText(
      "after",
      `
Example:
     $ tagoio set-env
     $ tagoio set-env dev`,
    );

  program
    .command("list-env")
    .description("list all your environment and show current default")
    .action(listEnvironment)
    .addHelpText(
      "after",
      `
Example:
   $ tagoio list-env`,
    );

  program
    .command("whoami")
    .description("show the active profile, scope, and config path (offline)")
    .option("--json", "emit a single JSON object on stdout for machine readers")
    .action(whoami)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio whoami
    $ tagoio whoami --json | jq .scope`,
    );

  analysisCommands(program);
  deviceCommands(program);
  dashboardCommands(program);
  entityCommands(program);
  filesCommands(program);
  profileCommands(program, defaultEnv);

  return program;
}

/**
 * Initializes the TagoIO Command Line Tools program and parses argv.
 */
async function initiateCMD() {
  maybeShowScopeNotice(resolveScope());
  const updateLog = await updater({ name: packageJSON.name, version: packageJSON.version });
  const program = buildProgram(defaultEnvironment);
  program.exitOverride(async () => {
    updateLog();
  });
  program.parse();
}

// Auto-run only when invoked as the CLI binary; importing this module from a
// build-time tool (e.g. the man-page generator) must NOT trigger argv parsing.
// `import.meta.url` is always a realpath; `process.argv[1]` may be a symlink
// (npm link, global installs). Compare on realpath so the binary still
// auto-starts when invoked through the npm-managed bin shim.
function isInvokedAsCLI(): boolean {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isInvokedAsCLI()) {
  initiateCMD().catch(console.error);
}

export { buildProgram };
