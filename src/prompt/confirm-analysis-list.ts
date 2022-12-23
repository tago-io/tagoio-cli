import prompts from "prompts";
import { IEnvironment } from "../lib/config-file";

async function confirmAnalysisFromConfig(analysis: IEnvironment["analysisList"], message: string = "Do you confirm the following analysis?") {
  const { scripts } = await prompts({
    message,
    name: "scripts",
    type: "autocompleteMultiselect",
    choices: analysis.map((x) => ({ title: `${x.fileName} [${x.name}]`, value: x, selected: true })),
  });

  return (scripts || []) as IEnvironment["analysisList"];
}

export { confirmAnalysisFromConfig };
