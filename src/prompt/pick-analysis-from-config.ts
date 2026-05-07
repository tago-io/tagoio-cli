import kleur from "kleur";
import prompts from "prompts";

import { IEnvironment } from "../lib/config-file.js";
import { errorHandler } from "../lib/messages.js";

type AnalysisEntry = NonNullable<IEnvironment["analysisList"]>[number];

const colorAnalysisName = (x: AnalysisEntry) => (x.fileName ? `${x.fileName} [${kleur.cyan(x.name)}]` : x.name);

/**
 * Prompts the user to select an analysis from a list of available analyses.
 * Analysis-* commands call `requireLocalScope()` first, so by the time this
 * prompt runs the list is guaranteed to exist (it's only undefined for global
 * scope, which never reaches here).
 */
async function pickAnalysisFromConfig(analysisList: IEnvironment["analysisList"], message: string = "Pick the analysis") {
  const list = analysisList ?? [];
  const { script } = await prompts({
    message,
    name: "script",
    type: "autocomplete",
    choices: list.map((x) => ({ title: colorAnalysisName(x), value: x })),
  });

  if (!script) {
    errorHandler("Analysis not selected");
  }

  return script as AnalysisEntry;
}

export { pickAnalysisFromConfig };
