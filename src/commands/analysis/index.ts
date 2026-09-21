import { Command } from "commander";
import kleur from "kleur";

import { cmdRepeatableValue } from "../../lib/commander-repeatable.js";

import { connectAnalysisConsole } from "./analysis-console.js";
import { analysisCreate } from "./analysis-create.js";
import { analysisDelete } from "./analysis-delete.js";
import { analysisEdit } from "./analysis-edit.js";
import { analysisInfo } from "./analysis-info.js";
import { analysisList } from "./analysis-list.js";
import { analysisSetMode } from "./analysis-set-mode.js";
import { deployAnalysis } from "./deploy.js";
import { duplicateAnalysis } from "./duplicate-analysis.js";
import { runAnalysis } from "./run-analysis.js";
import { triggerAnalysis } from "./trigger-analysis.js";

function handleNumber(value: string, _previous: unknown) {
  if (Number.isNaN(Number(value))) {
    throw `${value} is not a number`;
  }
  return Number(value);
}

function analysisCommands(program: Command) {
  program.command("Analysis Header");

  // Listed first in the section: every other analysis-* command takes an id, and
  // until now there was no way to discover one except reading it off the browser
  // URL.
  program
    .command("analysis-list")
    // No alias: "al" already belongs to action-list, and every other short form
    // in this namespace (am, at, ac, ad) is taken by an existing command.
    .description("get the list of analyses.")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-n, --name [name]", "partial name of the analysis")
    .option("--active", "only active analyses")
    .option("--inactive", "only inactive analyses")
    .option("--run-on <location>", "filter by tago or external")
    .option("-k, --tagkey [key]", "tag key to filter in", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to filter in", cmdRepeatableValue, [])
    .option("--amount <number>", "how many analyses to fetch (default: 100)", handleNumber)
    .option("--order-by <field>", "name, active, run_on, last_run, created_at or updated_at")
    .option("--order <direction>", "asc or desc (default: asc)")
    .option("-s, --stringify", "return list as text")
    .option("--json", "return json list")
    .option("--raw", "get object the same as stored")
    .action(analysisList)
    .addHelpText(
      "after",
      `
    An analysis that has never run reports last_run as "never".

    The analysis token is never included here — read it with
    'analysis-info <id> --show-token'.

Example:
    $ tagoio analysis-list
    $ tagoio analysis-list --name Alert
    $ tagoio analysis-list --run-on external --inactive
    $ tagoio analysis-list --order-by last_run --order desc
       `,
    );

  program
    .command("analysis-info")
    .description("get information about an analysis.")
    .argument("[ID]", "ID of your analysis")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--show-token", "include the analysis token in the output — writes a credential to stdout")
    .option("--json", "return result as json")
    .option("--raw", "get object the same as stored")
    .option("--silent", "do not prompt (requires the analysis ID)")
    .action(analysisInfo)
    .addHelpText(
      "after",
      `
    The analysis token authenticates as the analysis, so it is omitted unless
    --show-token asks for it. Only analyses running in external mode have one.

    --raw also surfaces timeout, secrets and console, which the API returns but
    the SDK types do not declare.

Example:
    $ tagoio analysis-info 62151835435d540010b768c4
    $ tagoio analysis-info 62151835435d540010b768c4 --json
    $ tagoio analysis-info 62151835435d540010b768c4 --show-token
       `,
    );

  program
    .command("analysis-create")
    .description("create a new analysis.")
    .argument("[name]", "name of the analysis")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--description <description>", "what the analysis does")
    .option("--runtime <runtime>", "node-rt2025, python-rt2025, deno-rt2025, node-legacy, python-legacy, node, python or other")
    .option("--run-on <location>", "tago or external (default: tago)")
    .option("--inactive", "create the analysis deactivated")
    .option("--var <KEY=VALUE>", "environment variable to set (repeatable)", cmdRepeatableValue, [])
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--silent", "do not prompt (requires the name)")
    .option("--json", "return result as json")
    .action(analysisCreate)
    .addHelpText(
      "after",
      `
    Creates the analysis without a script. Upload one afterwards with
    'analysis-deploy'.

    The runtime defaults to node-rt2025. The API's own default is node-legacy,
    which would quietly put new analyses on the legacy runtime.

    Variable values are always sent as strings: --var RETRIES=3 stores "3".

    Analyses are NOT scheduled here — the interval field the API exposes is
    silently ignored. Schedule one with an action instead:
    'action-create "<name>" --type schedule --cron "0 9 * * *" --script <id>'.

Example:
    $ tagoio analysis-create "Daily Report"
    $ tagoio analysis-create "Webhook Handler" --run-on external
    $ tagoio analysis-create "Sync" --runtime python-rt2025 --var API_URL=https://x.com
       `,
    );

  program
    .command("analysis-edit")
    .description("edit an analysis: rename it, change its runtime, variables, state or tags.")
    .argument("[ID]", "ID of your analysis")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--name <name>", "new name")
    .option("--description <description>", 'what the analysis does; pass "" to clear it')
    .option("--runtime <runtime>", "re-uploads the script under a new runtime; see the note below")
    .option("--run-on <location>", "tago or external")
    .option("--activate", "mark the analysis active")
    .option("--deactivate", "mark the analysis inactive")
    .option("--var <KEY=VALUE>", "environment variable to set (repeatable, replaces the set)", cmdRepeatableValue, [])
    .option("--clear-vars", "remove every environment variable")
    .option("-k, --tagkey [key]", "tag key to set (pairs with --tagvalue by index)", cmdRepeatableValue, [])
    .option("-v, --tagvalue [value]", "tag value to set", cmdRepeatableValue, [])
    .option("--merge-tags", "merge given tags into existing ones (default: replace the tag set)")
    .option("--silent", "do not prompt (requires the analysis ID)")
    .option("--json", "return result as json")
    .action(analysisEdit)
    .addHelpText(
      "after",
      `
    Tags and variables REPLACE the existing set by default. Pass --merge-tags to
    keep the tags you do not name; there is no equivalent for variables, so
    pass every one you want to keep.

    --runtime works by re-uploading the analysis' existing script under the new
    language, because that upload is what actually sets the runtime — a plain
    field update reports success and changes nothing. The script itself is
    preserved byte-for-byte, and the version number advances.

    That means the analysis needs a script already: on an empty one, --runtime
    fails and points at 'analysis-deploy'. To start on a given runtime instead,
    pass --runtime to 'analysis-create'.

    Use 'analysis-mode' to change run_on across many analyses at once.

Example:
    $ tagoio analysis-edit 62151835435d540010b768c4 --name "Renamed"
    $ tagoio analysis-edit 62151835435d540010b768c4 --deactivate
    $ tagoio analysis-edit 62151835435d540010b768c4 --runtime python-rt2025
    $ tagoio analysis-edit 62151835435d540010b768c4 --var A=1 --var B=2
    $ tagoio analysis-edit 62151835435d540010b768c4 -k env -v prod --merge-tags
       `,
    );

  program
    .command("analysis-delete")
    .description("permanently delete an analysis.")
    .argument("[ID]", "ID of your analysis")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-y, --yes", "skip the delete confirmation")
    .option("--silent", "do not prompt (requires the analysis ID)")
    .option("--json", "return result as json")
    .action(analysisDelete)
    .addHelpText(
      "after",
      `
    The script is deleted with the analysis, and any Action that runs this
    analysis will stop firing.

Example:
    $ tagoio analysis-delete 62151835435d540010b768c4
    $ tagoio analysis-delete 62151835435d540010b768c4 -y
       `,
    );

  program
    .command("analysis-deploy")
    .alias("deploy")
    .summary("deploy your analysis to TagoIO")
    .description(
      `deploy your analysis to TagoIO
    Analysis must be registered in your tagoconfig.ts file first
    You can register an analysis by using ${kleur.italic("tagoio init")}`,
    )
    .argument("[name]", "partial name of the analysis in config.js")
    .allowExcessArguments(true)
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-s, --silent", "will not prompt to confirm the deploy")
    .option("--deno", "Force build for Deno runtime", false)
    .option("--node", "Force build for Node.js runtime", false)
    .option("--all", "deploy every analysis from tagoconfig.json without prompting", false)
    .option("-t, --token <profile-token>", "profile token for this run (bypasses lock file, for CI/CD)")
    .action(deployAnalysis)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio deploy dashboard-handler
    $ tagoio deploy dashboard-handler --deno
    $ tagoio deploy dashboard-handler --node
    $ tagoio deploy --all                                       # deploy every analysis from tagoconfig.json
    $ tagoio deploy --all --env stage                              # deploy all to the stage environment
    $ tagoio deploy --all --env prod -t $TAGOIO_TOKEN --silent     # pipeline-friendly: no prompts, no lock file needed
    $ tagoio deploy --node
    $ tagoio deploy --deno`,
    );

  program
    .command("analysis-run")
    .alias("run")
    .summary("run your TagoIO analysis from your machine.")
    .description(
      `run your TagoIO analysis from your machine.
    If name is not provided, you will be prompted to select which analysis you want to run.

    Note: Analysis will automatically be edited to run in external at TagoIO side.
    To change it back to run at TagoIO, use ${kleur.italic("tagoio am")}`,
    )
    .argument("[name]", "partial name of the analysis in config.js")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-d, --debug", "run with --inspector for debug")
    .option("-c, --clear", "Will clear screen on restart")
    .option("--tsnd", "run with ts-node-dev if installed globally")
    .option("--deno", "Force build for Deno runtime", false)
    .option("--node", "Force build for Node.js runtime", false)
    .option("--no-interactive", "disable single-key shortcuts (q/h/r/c); shortcuts default on when stdin is a TTY")
    .action(runAnalysis)
    .addHelpText(
      "after",
      `
    Shortcuts (when stdin is a TTY, opt out with --no-interactive):
      r           restart the analysis
      c           clear the screen
      h, ?        show shortcut help
      q, Ctrl-C   quit (press Ctrl-C twice within 2s to force quit)

Example:
    $ tagoio run dashboard-handler
    $ tagoio run dash
    $ tagoio run dashboard-handler -d
    $ tagoio run dashboard-handler -d -c
    $ tagoio run dashboard-handler --deno
    $ tagoio run dashboard-handler --node
    $ tagoio run --deno
    $ tagoio run --node
    $ tagoio run dashboard-handler --no-interactive   # CI / piped logs
       `,
    );

  program
    .command("analysis-trigger")
    .alias("at")
    .description("send a signal to trigger your analysis TagoIO")
    .argument("[name]", "partial name of the analysis in config.js")
    .option("--json [JSON]", "JSON to be used in scope")
    .option("--tago", "pick analysis directly from TagoIO list")
    .option("--env, --environment [environment]", "environment from config.js")
    .action(triggerAnalysis)
    .addHelpText(
      "after",
      `
Example:
    $ tagoio analysis-trigger dash
    $ tagoio analysis-trigger dash --json "${JSON.stringify([{ variable: "test" }])}"`,
    );

  program
    .command("analysis-console")
    .alias("ac")
    .description("connect to your Analysis Console")
    .argument("[name]", "partial name of the analysis in config.js")
    .option("--env, --environment [environment]", "environment from config.js")
    .action(connectAnalysisConsole)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio analysis-console 62151835435d540010b768c4`,
    );

  program
    .command("analysis-duplicate")
    .alias("ad")
    .description("duplicate your Analysis")
    .argument("[ID]", "ID of the analysis")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("--name [string]", "new name for the Analysis")
    .action(duplicateAnalysis)
    .addHelpText(
      "after",
      `

Example:
    $ tagoio analysis-duplicate 62151835435d540010b768c4 --name "Duplicated Analysis"`,
    );

  program
    .command("analysis-mode")
    .alias("am")
    .summary("change an analysis or group of analysis to run on tago/external")
    .description(
      `change an analysis or group of analysis to run on tago/external

    If name is not provided, you will be prompted to select which analysis you want to update.
    Analysis in external mode are displayed first.`,
    )
    .argument("[name]", "partial analysis name to filter the list")
    .option("--env, --environment [environment]", "environment from config.js")
    .option("-f, --filterMode [external/tago]", "show only analysis in external/tago")
    .option("-m, --mode [external/tago]", "set as external or tago")
    .action(analysisSetMode)
    .addHelpText(
      "after",
      `

Example:
     $ tagoio analysis-duplicate 62151835435d540010b768c4 --name "Duplicated Analysis"`,
    );

  return program;
}

export { analysisCommands };
