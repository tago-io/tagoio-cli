import { Command } from "commander";

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
}

export { filesCommands };
