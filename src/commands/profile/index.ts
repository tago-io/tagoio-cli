import { Command, Option } from "commander";
import kleur from "kleur";

import { errorHandler, highlightMSG } from "../../lib/messages";
import { startExport } from "./export/export";
import { ENTITY_ORDER } from "./export/types";

function handleEntities(value: any, previous: any) {
  if (!ENTITY_ORDER.includes(value)) {
    errorHandler(`Invalid entity: ${value}`);
    process.exit(0);
  }
  return previous.concat([value]);
}

function profileCommands(program: Command, _defaultEnvironment: string) {
  program.command("Profiles Header");

  program
    .command("app-export")
    .alias("export")
    .description("export application from one profile to another")
    .option("--from <environment>", "environment exporting application")
    .option("--to <environment>", "environment receiving the application")
    .addOption(new Option("--from-token <profile-token>", "profile token of the environment").conflicts("from"))
    .addOption(new Option("--to-token <profile-token>", "profile token of the environment").conflicts("to"))
    .option("-e, --entity <entity>", "entities that will be exported (repeatable)", handleEntities, [])
    .addOption(new Option("--setup [environment]", "setup a profile to be exported").conflicts(["to", "from", "from-token", "to-token"]))
    .option("--pick", "prompt you to pick which entities to be exported")
    .action(startExport)
    .addHelpText(
      "after",
      `
    Export your profile/environment into another profile/environment.

    ${kleur.bold("Export Tags")}:
    - Export Tags are a key-pair of tags added to the entities you want to export. By default the tag key is export_id.
    - You can run --setup to user the CLI to go through all your entities and setup the Export Tag for you.
    - If targeted profile/environment already have an entity with same export tag, it will update the entity instead of creating a new one.

    ${kleur.bold("Entities Export")}:
    - ${highlightMSG("dashboards")}: Export the dashboard label, blueprint devices, tabs, tags and widgets of the dashboard.
    - ${highlightMSG("devices")}: Export the devices and copy relevant data from it, after erasing the data. Must specify the data with the --data option.
               If you are using device-tokens in Environment Variables or tags, you want to include the device in the export command.
    - ${highlightMSG("analysis")}: Export the analysis name, code, tags, mode and timeout settings.
    - ${highlightMSG("access")}: Export the access rules.
    - ${highlightMSG("run")}: Export sidebar buttons, sign-in buttons and email templates
    - ${highlightMSG("actions")}: Export actions.
    - ${highlightMSG("dictionaries")}: Export all the dictionaries slugs.

    ${kleur.bold("Backup")}:
    - Script will automatically create a backup under exportBackup folder inside your project.
    - You can use the backup to restore your profile/environment in case of any issues.

Example:
    $ tagoio export
    $ tagoio export --setup dev
    $ tagoio export --from dev --to prod
    $ tagoio export --from dev --to prod -e dashboards -e actions -e analysis
    $ tagoio export -ft cb8a1d42-0f28-4ee7-9862-839920eb1cb1 -tt eb8a1d42-0f28-4ee7-9862-839920eb1cb0
  `
    );
}

export { profileCommands };
