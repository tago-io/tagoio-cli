import { Command } from "commander";

import { copyTabWidgets } from "./copy-tab";

function dashboardCommands(program: Command) {
  program.command("Dashboards Header");
  program
    .command("copy-tab")
    .description("copy a tab of a dashboard to another tab")
    .argument("[dashboardID]", "ID of the dashboard")
    .option("-from, --from [tabID]", "ID of the Tab to copy")
    .option("-to, --to [tabID]", "ID of the Tab to paste")
    .option("-env, --environment [environment]", "environment from config.js")
    .action(copyTabWidgets)
    .addHelpText(
      "after",
      `
      Running this command will completely erase the target tab and replace it with a copy of the source tab.

Example:
    $ tagoio copy-tab
    $ tagoio copy-tab 62151835435d540010b768c4 -from 1688653060637 -to 2688653060638
    $ tagoio copy-tab 62151835435d540010b768c4 --env dev
       `
    );
}

export { dashboardCommands };
