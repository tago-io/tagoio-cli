#!/usr/bin/env node
import { Command, Option } from "commander";
import kleur from "kleur";
import { analysisCommands } from "./commands/analysis";
import { deviceCommands } from "./commands/devices";
import { setEnvironment } from "./commands/set-env";
import { ENTITY_ORDER, startExport } from "./commands/export/export";
import { tagoLogin } from "./commands/login";
import { startConfig } from "./commands/start-config";
import { getConfigFile } from "./lib/config-file";
import { configureHelp } from "./lib/configure-help";
import { errorHandler, highlightMSG } from "./lib/messages";
import { listEnvironment } from "./commands/list-env";

const packageJSON = require("../package.json");

const defaultEnvironment = getConfigFile()?.default || "prod";

function handleEntities(value: any, previous: any) {
  if (!ENTITY_ORDER.includes(value)) {
    errorHandler(`Invalid entity: ${value}`);
    process.exit(0);
  }
  return previous.concat([value]);
}

async function getAllCommands(program: Command) {
  analysisCommands(program);
  deviceCommands(program);
}

function errorColor(str: string) {
  // Add ANSI escape codes to display text in red.
  return `\x1b[31m${str}\x1b[0m`;
}

async function initiateCMD() {
  const program = new Command();
  program.version(packageJSON.version).description("TagoIO Command Line Tools");

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
    Note: If you don't store credentials in this command, you must run tago-cli login

Example:
    $ tago-cli init
    $ tago-cli init -t eb8a1d42-0f28-4ee7-9862-839920eb1cb0
    $ tago-cli init -env dev`
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
    Note: No need to login again if you already stored credentials with tago-cli init

Example:
    $ tago-cli login
    $ tago-cli login -u tago@tago.io -p 12345678
    $ tago-cli login -t eb8a1d42-0f28-4ee7-9862-839920eb1cb0`
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
     $ tago-cli set-env
     $ tago-cli set-env dev`
    );

  program
    .command("list-env")
    .description("list all your environment and show current default")
    .action(listEnvironment)
    .addHelpText(
      "after",
      `
Example:
   $ tago-cli list-env`
    );

  program
    .command("app-export")
    .alias("export")
    .description("export application from one profile to another")
    .option("--from <environment>", "environment exporting application")
    .option("--to <environment>", "environment receiving the application")
    .addOption(new Option("-ft, --from-token <profile-token>", "profile token of the environment").conflicts("from"))
    .addOption(new Option("-tt, --to-token <profile-token>", "profile token of the environment").conflicts("to"))
    .option("-e, --entity <entity>", "entities that will be exported (repeatable)", handleEntities, [])
    .addOption(
      new Option("--setup [environment]", "setup a profile to be exported")
        .default(defaultEnvironment, "Default Environment")
        .conflicts(["to", "from", "from-token", "to-token"])
    )
    .action(startExport)
    .addHelpText(
      "after",
      `
    Export your profile/environment into another profile/environment.

    ${kleur.bold("Export Tags")}:
    - Export Tags are a key-pair of tags added to the entities you want to export. By default the tag key is export_id.
    - You can run --setup to user the CLI to go through all your entities and setup the Export Tag for you.
    - If targeted profile/environment already have an entity with same export tag, it will update the entitity instead of creating a new one.

    ${kleur.bold("Entities Export")}:
    - ${highlightMSG("dashboards")}: Export the dashboard label, blueprint devices, tabs, tags and widgets of the dashboard.
    - ${highlightMSG("devices")}: Export the devices and copy relevant data from it, after erasing the data. Must specify the data with the --data option.
               If you are using device-tokens in Environment Variables or tags, you want to include the device in the export command.
    - ${highlightMSG("analysis")}: Export the analysis name, code, tags, mode and timeout settings.
    - ${highlightMSG("access")}: Export the access rules.
    - ${highlightMSG("run")}: Export sidebar buttons, signin buttons and email templates
    - ${highlightMSG("actions")}: Export actions.
    - ${highlightMSG("dictionaries")}: Export all the dictionaries slugs.

Example:
    $ tago-cli export
    $ tago-cli export --setup dev
    $ tago-cli export --from dev --to prod
    $ tago-cli export --from dev --to prod -e dashboards -e actions -e analysis
    $ tago-cli export -ft cb8a1d42-0f28-4ee7-9862-839920eb1cb1 -tt eb8a1d42-0f28-4ee7-9862-839920eb1cb0
  `
    );

  await getAllCommands(program);

  program.parse();
}
initiateCMD().catch(console.error);
