#!/usr/bin/env node
import { Command } from "commander";
import { analysisCommands } from "./commands/analysis";
import { deviceCommands } from "./commands/devices";
import { setEnvironment } from "./commands/devices/set-env";
import { tagoLogin } from "./commands/login";
import { startConfig } from "./commands/start-config";

function getAllCommands(program: Command) {
  analysisCommands(program);
  deviceCommands(program);
}

function errorColor(str: string) {
  // Add ANSI escape codes to display text in red.
  return `\x1b[31m${str}\x1b[0m`;
}

const program = new Command();
program.version("1.0.0").description("TagoIO Command Line Tools");

program.configureOutput({
  writeErr: (str) => process.stdout.write(`[${errorColor("ERROR")}] ${str}`),
});

program
  .command("init")
  .description("create/update the config file for analysis in your current folder")
  .option("-env, --environment <name>", "name of the environment.")
  .option("-t, --token <profile-token>", "profile token of the environment")
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
  .argument("<environment>", "name of the environment")
  .option("-u, --email <email>", "your TagoIO email")
  .option("-p, --password <password>", "your TagoIO password")
  .option("-t, --token <profile-token>", "set a profile-token for the environment")
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
  .description("set default environment")
  .argument("<environment>", "name of the environment")
  .action(setEnvironment)
  .addHelpText(
    "after",
    `
Example:
   $ tago-cli set-env dev`
  );

getAllCommands(program);

program.parse(process.argv);
