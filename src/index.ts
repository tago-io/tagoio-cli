import { Command } from "commander";
import { analysisCommands } from "./commands/analysis";
import { deviceCommands } from "./commands/devices";
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
  .action(startConfig);

program
  .command("login")
  .description("login to your account and get a profile-token")
  .argument("<environment>", "name of the environment")
  .option("-u, --email <email>", "your TagoIO email")
  .option("-p, --password <password>", "your TagoIO password")
  .option("-t, --token <profile-token>", "set a profile-token for the environment")
  .action(tagoLogin);

program.command("set-environment").description("set default environment").argument("<environment>", "name of the environment").action(tagoLogin);

getAllCommands(program);

program.parse(process.argv);
