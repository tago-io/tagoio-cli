import { Command } from "commander";

import { widgetEditURLCommand } from "./edit-url.js";

function widgetCommands(program: Command) {
  program.command("Custom Widgets Header");
  program
    .command("widget-edit-url")
    .description("set the URL on a custom (iframe) widget")
    .argument("<dashboardID>", "ID of the dashboard")
    .argument("<widgetID>", "ID of the custom widget")
    .argument("<url>", "URL to set on the widget")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(widgetEditURLCommand)
    .addHelpText(
      "after",
      `
    Reads the widget first and preserves its existing parameters, theme,
    and frame settings; only the URL changes.

Example:
    $ tagoio widget-edit-url 64f... 1700000000000 https://api.us-e1.tago.io/file/p/custom-widgets/line-chart/index.html
       `,
    );
}

export { widgetCommands };
