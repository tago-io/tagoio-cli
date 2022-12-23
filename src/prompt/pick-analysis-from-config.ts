import kleur from "kleur";
import prompts from "prompts";
import { IEnvironment } from "../lib/config-file";

const renameAnalysis = (x: IEnvironment["analysisList"][0]) => (x.fileName ? `${x.fileName} [${kleur.cyan(x.name)}]` : x.name);
async function pickAnalysisFromConfig(analysisList: IEnvironment["analysisList"], message: string = "Pick the analysis") {
  const { script } = await prompts({
    message,
    name: "script",
    type: "autocomplete",
    choices: analysisList.map((x) => ({ title: renameAnalysis(x), value: x })),
  });

  return script as IEnvironment["analysisList"][0];
}
export { pickAnalysisFromConfig };
