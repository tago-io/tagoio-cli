#!/usr/bin/env node
import { readFileSync } from "fs";
import { Command } from "commander";
import dotenv from "dotenv";
import kleur from "kleur";

import { analysisCommands } from "./commands/analysis";
import { dashboardCommands } from "./commands/dashboard";
import { deviceCommands } from "./commands/devices";
import { listEnvironment } from "./commands/list-env";
import { tagoLogin } from "./commands/login";
import { profileCommands } from "./commands/profile";
import { setEnvironment } from "./commands/set-env";
import { startConfig } from "./commands/start-config";
import { getConfigFile, resolveCLIPath } from "./lib/config-file";
import { configureHelp } from "./lib/configure-help";
import { ENV_FILE_PATH } from "./lib/dotenv-config";
import { highlightMSG } from "./lib/messages";
import { updater } from "./lib/notify-update";

/**
 * Loads the package.json file from the CLI directory.
 */
const packageJSON = JSON.parse(readFileSync(resolveCLIPath("./package.json")).toString());
dotenv.config({ path: ENV_FILE_PATH });

const indexConfigFile = getConfigFile();
const defaultEnvironment = process.env.TAGOIO_DEFAULT || "";

/**
 * Calls functions to add all available commands to the CLI program.
 * @param program - The CLI program to add commands to.
 * @returns A Promise that resolves when all commands have been added.
 */
async function getAllCommands(program: Command) {
  analysisCommands(program);
  deviceCommands(program);
  dashboardCommands(program);
  profileCommands(program, defaultEnvironment);
}

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
 * Initializes the TagoIO Command Line Tools program and sets up the available commands.
 * @returns {Promise<void>} A Promise that resolves when the program has finished parsing the command line arguments.
 */
async function initiateCMD() {
  const updateLog = await updater({ name: packageJSON.name, version: packageJSON.version });
  const program = new Command();
  program.exitOverride(async () => {
    updateLog();
  });

  program.version(packageJSON.version).description(`${kleur.bold(`TagoIO Command Line Tools - v${packageJSON.version}`)}
  \tDefault Environment: ${highlightMSG(defaultEnvironment)}
  \tProfile ID: ${highlightMSG(indexConfigFile?.[defaultEnvironment]?.id || "N/A")}
  \tName: ${highlightMSG(indexConfigFile?.[defaultEnvironment]?.profileName || "N/A")}
  \tEmail: ${highlightMSG(indexConfigFile?.[defaultEnvironment]?.email || "N/A")}`);

  program.configureOutput({
    writeErr: (str) => process.stdout.write(`[${errorColor("ERROR")}] ${str}`),
  });

  configureHelp(program);

  program
    .command("init")
    .description("create/update the config file for analysis in your current folder")
    .argument("[environment]", "name of the environment.", defaultEnvironment)
    .option("-t, --token <profile-token>", "profile token of the environment and skip login step")
    .action(startConfig)
    .addHelpText(
      "after",
      `
    Note: If you don't store credentials in this command, you must run tagoio login

Example:
    $ tagoio init
    $ tagoio init -t eb8a1d42-0f28-4ee7-9862-839920eb1cb0
    $ tagoio init -env dev`
    );

  program
    .command("login")
    .description("login to your account and store profile_token in the tago-lock.")
    .argument("[environment]", "name of the environment", defaultEnvironment)
    .option("-u, --email <email>", "your TagoIO email")
    .option("-p, --password <password>", "your TagoIO password")
    .option("-t, --token <profile-token>", "set a profile-token for the environment and skip login step")
    .action(tagoLogin)
    .addHelpText(
      "after",
      `
    Note: No need to login again if you already stored credentials with tagoio init

Example:
    $ tagoio login
    $ tagoio login -u tago@tago.io -p 12345678
    $ tagoio login -t eb8a1d42-0f28-4ee7-9862-839920eb1cb0`
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
     $ tagoio set-env dev`
    );

  program
    .command("list-env")
    .description("list all your environment and show current default")
    .action(listEnvironment)
    .addHelpText(
      "after",
      `
Example:
   $ tagoio list-env`
    );

  await getAllCommands(program);

  program.parse();
}

initiateCMD().catch(console.error);
