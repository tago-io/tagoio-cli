import { Command, Option } from "commander";
import kleur from "kleur";

import { errorHandler, highlightMSG } from "../../lib/messages";
import { createBackup } from "./backup/create";
import { downloadBackup } from "./backup/download";
import { listBackups } from "./backup/list";
import { restoreBackup } from "./backup/restore";
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
  `,
    );

  const backupCommand = program.command("backup").description("profile backup management commands");

  backupCommand
    .command("create")
    .description("create a new profile backup")
    .action(createBackup)
    .addHelpText(
      "after",
      `
    Create a new backup for your current profile. The backup includes user files, dashboard history,
    analysis scripts, and resource configurations.

    ${kleur.bold("Important Notes")}:
    - Backup creation is ${highlightMSG("asynchronous")} and may take several minutes to complete.
    - You can only create ${highlightMSG("one backup per day")} per account.
    - This feature is ${highlightMSG("not available")} on the Free plan.

Example:
    $ tagoio backup create
  `,
    );

  backupCommand
    .command("list")
    .description("list all profile backups")
    .option("--page <number>", "page number for pagination", parseInt)
    .option("--amount <number>", "number of backups per page", parseInt)
    .option("--order-by <field>", "field to order by (default: created_at)")
    .option("--order <direction>", "sort direction: asc or desc (default: desc)")
    .action(listBackups)
    .addHelpText(
      "after",
      `
    List all backups for your current profile. Displays backup ID, status, creation date, and file size.

    ${kleur.bold("Backup Statuses")}:
    - ${highlightMSG("queued")}: Awaiting processing
    - ${highlightMSG("processing")}: Backup generation in progress
    - ${highlightMSG("completed")}: Ready for download
    - ${highlightMSG("failed")}: Generation unsuccessful

Example:
    $ tagoio backup list
    $ tagoio backup list --page 1 --amount 10
    $ tagoio backup list --order-by created_at --order asc
  `,
    );

  backupCommand
    .command("restore")
    .description("restore profile from a backup")
    .option("--granular [mode]", "select specific resources to restore (use 'item' for item-level selection)")
    .action(restoreBackup)
    .addHelpText(
      "after",
      `
    Interactively restore your profile from a completed backup.

    ${kleur.bold("Restore Flow")}:
    1. Select a backup from the list of completed backups
    2. Enter your account password (and OTP if 2FA is enabled)
    3. Review the backup contents summary
    4. ${highlightMSG("(Optional)")} Select specific resources to restore with --granular
    5. Confirm and execute the restoration

    ${kleur.bold("Options")}:
    - ${highlightMSG("--granular")}: Select which resource types to restore.
    - ${highlightMSG("--granular item")}: Select resource types AND specific items within each (searchable).

    ${kleur.bold("Important Notes")}:
    - Only backups with status ${highlightMSG("completed")} can be restored.
    - ${highlightMSG("New IDs")} will be generated for all restored resources.
    - The download URL is valid for ${highlightMSG("2 hours")}.

Example:
    $ tagoio backup restore
    $ tagoio backup restore --granular
    $ tagoio backup restore --granular item
  `,
    );

  backupCommand
    .command("download")
    .description("download a backup file to local folder")
    .action(downloadBackup)
    .addHelpText(
      "after",
      `
    Download a backup file to a local folder for safekeeping or manual inspection.

    ${kleur.bold("Download Flow")}:
    1. Select a backup from the list of completed backups
    2. Enter your account password (and OTP if 2FA is enabled)
    3. Backup file is downloaded to ${highlightMSG("profile-backup-download")} folder

    ${kleur.bold("Important Notes")}:
    - Only backups with status ${highlightMSG("completed")} can be downloaded.
    - The download URL is valid for ${highlightMSG("2 hours")}.
    - File is saved as ${highlightMSG("backup-<id>.zip")} in the download folder.

Example:
    $ tagoio backup download
  `,
    );
}

export { profileCommands };
