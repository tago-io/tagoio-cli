import prompts from "prompts";

import { IEnvironment } from "../lib/config-file";

/**
 * Prompts the user to choose one or more analysis from a list of available analysis.
 * @param analysis - The list of available analysis to choose from.
 * @param message - The message to display to the user when prompting them to choose the analysis.
 * @returns The list of analysis chosen by the user.
 */
async function chooseAnalysisListFromConfig(analysis: IEnvironment["analysisList"], message: string = "Choose the analysis") {
  const { scripts } = await prompts({
    message,
    name: "scripts",
    type: "autocompleteMultiselect",
    choices: analysis.map((x) => ({ title: `${x.fileName} [${x.name}]`, value: x })),
  });

  return (scripts || []) as IEnvironment["analysisList"];
}

export { chooseAnalysisListFromConfig };
