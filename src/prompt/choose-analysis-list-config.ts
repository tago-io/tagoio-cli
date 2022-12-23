import prompts from "prompts";
import { IEnvironment } from "../lib/config-file";

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
