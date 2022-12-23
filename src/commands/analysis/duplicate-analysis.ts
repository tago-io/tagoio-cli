import zlib from "zlib";
import { Account } from "@tago-io/sdk";
import axios from "axios";
import prompts from "prompts";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";
import { pickAnalysisFromTagoIO } from "../../prompt/pick-analysis-from-tagoio";

async function askAnalysisName(initial: string) {
  const { name } = await prompts({
    message: "Choose the duplicated analysis",
    name: "name",
    type: "text",
    initial,
  });

  return name;
}

async function duplicateAnalysis(analysisID: string | void, options: { environment: string; name?: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken });
  if (!analysisID) {
    const analysis = await pickAnalysisFromTagoIO(account, "Pick the analysis you want to duplicate");
    analysisID = analysis.id;
  }

  if (!analysisID) {
    errorHandler("Cancelled");
    return;
  }

  const analysis = await account.analysis.info(analysisID).catch(() => null);
  if (!analysis) {
    throw errorHandler(`Analysis ID ${analysisID} can't be found`);
  }

  const script = await account.analysis.downloadScript(analysis.id);
  const scriptBase64 = await axios
    .get(script.url, {
      responseType: "arraybuffer",
    })
    .then((response) => zlib.gunzipSync(response.data).toString("base64"));

  const newAnalysisName = options.name ?? `${analysis.name} - Copy`;
  if (!options.name) {
    options.name = await askAnalysisName(newAnalysisName);
  }

  const { id: new_analysis_id } = await account.analysis.create({
    ...analysis,
    name: newAnalysisName,
  });

  await account.analysis.uploadScript(new_analysis_id, {
    content: scriptBase64,
    language: analysis.runtime || "node",
    name: "script.js",
  });

  successMSG(`Analysis succesfully duplicated: ${newAnalysisName}`);
}

export { duplicateAnalysis };
