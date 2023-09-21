import kleur from "kleur";
import prompts from "prompts";

import { IEnvironment } from "../lib/config-file";
import { errorHandler } from "../lib/messages";

const colorAnalysisName = (x: IEnvironment["analysisList"][0]) => (x.fileName ? `${x.fileName} [${kleur.cyan(x.name)}]` : x.name);

/**
 * Prompts the user to select an analysis from a list of available analyses.
 * @param analysisList - The list of available analyses.
 * @param message - The message to display to the user.
 * @returns The selected analysis.
 */
async function pickAnalysisFromConfig(analysisList: IEnvironment["analysisList"], message: string = "Pick the analysis") {
  const { script } = await prompts({
    message,
    name: "script",
    type: "autocomplete",
    choices: analysisList.map((x) => ({ title: colorAnalysisName(x), value: x })),
  });

  if (!script) {
    errorHandler("Analysis not selected");
    return process.exit();
  }

  return script as IEnvironment["analysisList"][0];
}

export { pickAnalysisFromConfig };
