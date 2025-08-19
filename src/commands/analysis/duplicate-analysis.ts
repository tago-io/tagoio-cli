import zlib from "zlib";
import axios from "axios";
import prompts from "prompts";

import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";
import { pickAnalysisFromTagoIO } from "../../prompt/pick-analysis-from-tagoio";

/**
 * Asks the user to choose the duplicated analysis name.
 * @param initial - The initial value for the analysis name.
 * @returns A promise that resolves to the analysis name chosen by the user.
 */
async function askAnalysisName(initial: string) {
  const { name } = await prompts({
    message: "Choose the duplicated analysis",
    name: "name",
    type: "text",
    initial,
  });

  return name;
}

/**
 * Creates a new analysis in TagoIO.
 * @param account - The TagoIO account object.
 * @param newAnalysisName - The name of the new analysis.
 * @param scriptBase64 - The base64-encoded script for the new analysis.
 * @param analysis - The analysis object to be duplicated.
 * @returns A Promise that resolves when the new analysis is successfully created.
 */
async function createNewAnalysis(account: Account, newAnalysisName: string, scriptBase64: string, analysis: AnalysisInfo) {
  const { id: new_analysis_id } = await account.analysis.create({
    ...analysis,
    name: newAnalysisName,
  });

  await account.analysis.uploadScript(new_analysis_id, {
    content: scriptBase64,
    language: analysis.runtime || "node",
    name: "script.js",
  });

  successMSG(`Analysis successfully duplicated: ${newAnalysisName}`);
}

/**
 * Downloads the script of an analysis and returns it as a base64 string.
 * @param account - The TagoIO account object.
 * @param analysisId - The ID of the analysis to download the script from.
 * @returns A promise that resolves to the base64-encoded script.
 * @throws If the script download fails.
 */
async function downloadScriptBase64(account: Account, analysisId: string): Promise<string> {
  try {
    const script = await account.analysis.downloadScript(analysisId);
    return axios
      .get(script.url, {
        responseType: "arraybuffer",
      })
      .then((response) => zlib.gunzipSync(response.data).toString("base64"));
  } catch (error) {
    errorHandler(`Failed to download script for analysis ID ${analysisId}: ${error.message}`);
    return process.exit(0);
  }
}

/**
 * Duplicates an analysis in TagoIO.
 * @param analysisID - The ID of the analysis to be duplicated.
 * @param options - The options for the duplication process.
 * @param options.environment - The environment where the analysis is located.
 * @param options.name - The name of the new analysis. If not provided, the name will be "original analysis name - Copy".
 * @returns A Promise that resolves when the analysis is successfully duplicated.
 * @throws An error if the analysis ID is not found or if the environment is not found.
 */
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

  const scriptBase64 = await downloadScriptBase64(account, analysisID);
  const newAnalysisName = options.name ?? `${analysis.name} - Copy`;
  if (!options.name) {
    options.name = await askAnalysisName(newAnalysisName);
  }

  await createNewAnalysis(account, newAnalysisName, scriptBase64, analysis);
}

export { duplicateAnalysis };
