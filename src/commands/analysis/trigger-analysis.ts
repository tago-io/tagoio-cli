import kleur from "kleur";

import { Account } from "@tago-io/sdk";

import { getEnvironmentConfig, IEnvironment } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";
import { pickAnalysisFromTagoIO } from "../../prompt/pick-analysis-from-tagoio";

/**
 * Triggers an analysis with the given script name and options.
 * @param scriptName - The name of the script to trigger.
 * @param options - The options for triggering the analysis.
 * @param options.environment - The environment to use for triggering the analysis.
 * @param options.json - The JSON data to pass to the analysis.
 * @param options.tago - Whether to pick the analysis from TagoIO.
 */
async function triggerAnalysis(scriptName: string | void, options: { environment?: string; json?: string; tago: boolean }) {
  const config = getEnvironmentConfig(options.environment);

  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  const analysisList = config.analysisList.filter((x) => x.fileName);

  let script: IEnvironment["analysisList"][0] | undefined;

  if (!scriptName && options.tago) {
    const analysis = await pickAnalysisFromTagoIO(account);
    script = { name: analysis.name, id: analysis.id, fileName: "" };
  } else if (!scriptName) {
    script = await pickAnalysisFromConfig(analysisList, "Pick the analysis you want to trigger");
  } else {
    script = searchName(
      scriptName,
      config.analysisList.map((x) => ({ names: [x.name, x.fileName], value: x })),
    );
  }

  if (!script) {
    errorHandler("Analysis not found");
    return;
  }

  infoMSG(`Analysis found: ${script.name} [${script.id}].`);

  try {
    await account.analysis.run(script.id, options.json as any);
    successMSG(`Analysis triggered: ${kleur.cyan(script?.name || "")} [${script?.id}]`);
  } catch (error) {
    errorHandler(error);
  }
}

export { triggerAnalysis };
