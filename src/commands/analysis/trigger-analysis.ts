import { Account } from "@tago-io/sdk";
import kleur from "kleur";
import { getEnvironmentConfig, IEnvironment } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";
import { pickAnalysisFromTagoIO } from "../../prompt/pick-analysis-from-tagoio";

async function triggerAnalysis(scriptName: string | void, options: { environment?: string; json?: string; tago: boolean }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });

  const analysisList = config.analysisList.filter((x) => x.fileName);
  let script: IEnvironment["analysisList"][0] | undefined;
  if (!scriptName && options.tago) {
    const analysis = await pickAnalysisFromTagoIO(account);
    script = { name: analysis.name, id: analysis.id, fileName: "" };
  } else if (!scriptName) {
    script = await pickAnalysisFromConfig(analysisList, "Pick the analysis you want to trigger");
  } else {
    script = config.analysisList.find((x) => searchName(scriptName, x.fileName, x.name));
  }

  if (!script) {
    errorHandler("Analysis not found");
    return;
  }

  // for (const { id: analysisID, fileName } of script) {
  infoMSG(`Analysis found: ${script.name} [${script.id}].`);
  await account.analysis.run(script.id, options.json).then(() => {
    successMSG(`Analysis triggered: ${kleur.cyan(script?.name || "")} [${script?.id}]`);
  });
  // }
}

export { triggerAnalysis };
