import { Command } from "commander";
import kleur from "kleur";
import { connectAnalysisConsole } from "./analysis-console";
import { analysisSetMode } from "./analysis-set-mode";
import { deployAnalysis } from "./deploy";
import { duplicateAnalysis } from "./duplicate-analysis";
import { runAnalysis } from "./run-analysis";
import { triggerAnalysis } from "./trigger-analysis";

function analysisCommands(program: Command) {
  program.command("Analysis Header");

  program
    .command("analysis-deploy")
    .alias("deploy")
    .summary("deploy your analysis to TagoIO")
    .description(
      `deploy your analysis to TagoIO
    Analysis must be registered in your tagoconfig.ts file first
    You can register an analysis by using ${kleur.italic("tagoio init")}`
    )
    .argument("[name]", "partial name of the analysis in config.js")
    .allowExcessArguments(true)
    .option("-env, --environment [environment]", "environment from config.js")
    .option("-s, --silent", "will not prompt to confirm the deploy")
    .action(deployAnalysis)
    .addHelpText(
      "after",
      `
Example:
    $ tago-cli deploy all
    $ tago-cli deploy all -e stage
    $ tago-cli deploy dashboard-handler`
    );

  program
    .command("analysis-run")
    .alias("run")
    .summary("run your TagoIO analysis from your machine.")
    .description(
      `run your TagoIO analysis from your machine.
    If name is not provided, you will be prompted to select which analysis you want to run.

    Note: Analysis will automatically be edited to run in external at TagoIO side.
    To change it back to run at tagoio, use ${kleur.italic("tagoio am")}`
    )
    .argument("[name]", "partial name of the analysis in config.js")
    .option("-env, --environment [environment]", "environment from config.js")
    .option("-d, --debug", "run with --inspector for debug")
    .option("-c, --clear", "Will clear screen on restart")
    .action(runAnalysis)
    .addHelpText(
      "after",
      `

Example:
    $ tago-cli run dashboard-handler
    $ tago-cli run dash
    $ tago-cli run dashboard-handler -d
    $ tago-cli run dashboard-handler -d -c
       `
    );

  program
    .command("analysis-trigger")
    .alias("at")
    .description("send a signal to trigger your analysis TagoIO")
    .argument("[name]", "partial name of the analysis in config.js")
    .option("--json [JSON]", "JSON to be used in scope")
    .option("--tago", "pick analysis directly from TagoIO list")
    .option("-env, --environment [environment]", "environment from config.js")
    .action(triggerAnalysis)
    .addHelpText(
      "after",
      `
Example:
    $ tago-cli analysis-trigger dash
    $ tago-cli analysis-trigger dash --json "${JSON.stringify([{ variable: "test" }])}"`
    );

  program
    .command("analysis-console")
    .alias("ac")
    .description("connect to your Analysis Console")
    .argument("[name]", "partial name of the analysis in config.js")
    .option("-env, --environment [environment]", "environment from config.js")
    .action(connectAnalysisConsole)
    .addHelpText(
      "after",
      `

Example:
    $ tago-cli analysis-console 62151835435d540010b768c4`
    );

  program
    .command("analysis-duplicate")
    .alias("ad")
    .description("duplicate your Analysis")
    .argument("[ID]", "ID of the analysis")
    .option("-env, --environment [environment]", "environment from config.js")
    .option("--name [string]", "new name for the Analysis")
    .action(duplicateAnalysis)
    .addHelpText(
      "after",
      `

Example:
    $ tago-cli analysis-duplicate 62151835435d540010b768c4 --name "Duplicated Analysis"`
    );

  program
    .command("analysis-mode")
    .alias("am")
    .summary("change an analysis or group of analysis to run on tago/external")
    .description(
      `change an analysis or group of analysis to run on tago/external

    If name is not provided, you will be prompted to select which analysis you want to update.
    Analysis in external mode are displayed first.`
    )
    .argument("[name]", "partial analysis name to filter the list")
    .option("-env, --environment [environment]", "environment from config.js")
    .option("-f, --filterMode [external/tago]", "show only analysis in external/tago")
    .option("-m, --mode [external/tago]", "set as external or tago")
    .action(analysisSetMode)
    .addHelpText(
      "after",
      `

Example:
     $ tago-cli analysis-duplicate 62151835435d540010b768c4 --name "Duplicated Analysis"`
    );

  return program;
}

export { analysisCommands };
