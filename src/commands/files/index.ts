import { Command } from "commander";

import { filesCopyCommand } from "./copy.js";
import { filesDeleteCommand } from "./delete.js";
import { filesDownloadCommand } from "./download.js";
import { filesListCommand } from "./list.js";
import { filesMoveCommand } from "./move.js";
import { filesPermissionCommand } from "./permission.js";
import { filesRenameCommand } from "./rename.js";
import { uploadFilesCommand } from "./upload.js";
import { filesURLCommand } from "./url.js";

function filesCommands(program: Command) {
  program.command("Files Header");
  program
    .command("files-upload")
    .description("upload a local file or folder to TagoIO Files")
    .argument("<localPath>", "local file or folder to upload")
    .argument("[remotePath]", "destination prefix in Files (defaults to the basename of localPath)")
    .option("--public", "make every uploaded file public")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(uploadFilesCommand)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio files-upload ./widgets/_dist/line-chart custom-widgets/line-chart --public
    $ tagoio files-upload ./report.pdf reports/report.pdf
    $ tagoio files-upload ./dist --env prod --token $TAGOIO_TOKEN
       `,
    );

  program
    .command("files-url")
    .description("print the URL of a file already in TagoIO Files")
    .argument("<remotePath>", "path of the file in Files (e.g. custom-widgets/line-chart/index.html)")
    .option("--signed", "return a signed URL for a private file")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesURLCommand)
    .addHelpText(
      "after",
      `
    The URL is printed on stdout alone, so it can be captured in scripts.

Example:
    $ tagoio files-url custom-widgets/line-chart/index.html
    $ tagoio files-url private/report.pdf --signed
    $ URL=$(tagoio files-url custom-widgets/line-chart/index.html)
       `,
    );

  program
    .command("files-list")
    .description("list files and folders under a path in TagoIO Files")
    .argument("[path]", "path to list (root if omitted)")
    .option("--json", "emit a JSON object on stdout for machine readers")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesListCommand)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio files-list
    $ tagoio files-list custom-widgets/line-chart
    $ tagoio files-list custom-widgets --json | jq '.files'
       `,
    );

  program
    .command("files-move")
    .description("move a file or folder prefix to a new path")
    .argument("<from>", "source file or folder prefix")
    .argument("<to>", "destination path")
    .option("-y, --yes", "skip the confirmation prompt for folder moves (CI/CD)")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesMoveCommand)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio files-move custom-widgets/lc/index.html backups/lc/index.html
    $ tagoio files-move custom-widgets/line-chart backups/line-chart --yes
       `,
    );

  program
    .command("files-rename")
    .description("rename a file or folder in place (keeps its directory)")
    .argument("<path>", "file or folder to rename")
    .argument("<newName>", "new name for the last path segment (no '/')")
    .option("-y, --yes", "skip the confirmation prompt for folder renames (CI/CD)")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesRenameCommand)
    .addHelpText(
      "after",
      `
    Keeps the parent directory and changes only the last segment. Use
    'tagoio files-move' to move across directories.

Example:
    # rename a file (stays in the same directory)
    $ tagoio files-rename custom-widgets/lc/index.html app.html
    # rename a folder (every file under the prefix moves with it)
    $ tagoio files-rename custom-widgets/line-chart line-chart-v2 --yes
       `,
    );

  program
    .command("files-copy")
    .description("copy a file or folder prefix to a new path")
    .argument("<from>", "source file or folder prefix")
    .argument("<to>", "destination path")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesCopyCommand)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio files-copy reports/a.pdf backups/a.pdf
    $ tagoio files-copy custom-widgets/line-chart backups/line-chart
       `,
    );

  program
    .command("files-delete")
    .description("delete a file or every file under a folder prefix")
    .argument("<path>", "file or folder prefix to delete")
    .option("-y, --yes", "skip the confirmation prompt (CI/CD)")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesDeleteCommand)
    .addHelpText(
      "after",
      `
    Always confirms (a folder shows the file count) unless --yes.

Example:
    $ tagoio files-delete reports/old.pdf
    $ tagoio files-delete custom-widgets/line-chart-test --yes
       `,
    );

  program
    .command("files-download")
    .description("download a file or folder prefix to the local disk")
    .argument("<remotePath>", "file or folder prefix in Files")
    .argument("[localDest]", "local destination (defaults to the basename in cwd)")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesDownloadCommand)
    .addHelpText(
      "after",
      `
    Private files are downloaded via a signed URL automatically.

Example:
    $ tagoio files-download reports/a.pdf
    $ tagoio files-download custom-widgets/line-chart ./local-lc
       `,
    );

  program
    .command("files-permission")
    .description("make a file or folder public or private")
    .argument("<path>", "file or folder prefix")
    .argument("<visibility>", "'public' or 'private'")
    .option("-y, --yes", "skip the confirmation prompt for folder changes (CI/CD)")
    .option("--env, --environment [environment]", "environment from tagoconfig.json")
    .option("-t, --token [token]", "profile token, bypasses the lock file (CI/CD)")
    .action(filesPermissionCommand)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio files-permission custom-widgets/line-chart public --yes
    $ tagoio files-permission private/report.pdf private
       `,
    );
}

export { filesCommands };
