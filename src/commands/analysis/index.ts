import { Command } from "commander";
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
    .description("deploy your analysis to TagoIO")
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
    .description("run your analysis TagoIO if it's in External Mode")
    .argument("<name>", "partial name of the analysis in config.js")
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
    .alias("an")
    .description("change an analysis or group of analysis to run on tago/external")
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
