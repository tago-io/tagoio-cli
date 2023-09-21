import kleur from "kleur";

import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk/lib/types";

import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { chooseFromList } from "../../prompt/choose-from-list";
import { pickFromList } from "../../prompt/pick-from-list";

/**
 * Retrieves a list of analysis from TagoIO that match the specified filter criteria.
 * @param {Account} account - The TagoIO account object.
 * @param {string | undefined} analysisFilterName - The name of the analysis to filter by.
 * @param {string} filterMode - The mode to filter by (e.g. "release", "debug", etc.).
 * @returns {Promise<AnalysisInfo[]>} - A promise that resolves to an array of AnalysisInfo objects.
 */
async function getAnalysisListFromTagoIO(account: Account, analysisFilterName: string | undefined, filterMode: string) {
  const filterByRunON = (r: AnalysisInfo[]) => (filterMode ? r.filter((x) => x.run_on === filterMode) : r);

  return await account.analysis
    .list({
      amount: 100,
      filter: { name: analysisFilterName },
      fields: ["id", "name", "run_on"],
    })
    .then(filterByRunON)
    .catch(errorHandler);
}

/**
 * Prompts the user to choose an analysis from a list and returns the selected analysis.
 * @param {Account} account - The TagoIO account object.
 * @param {AnalysisInfo[]} analysisList - The list of analysis to choose from.
 * @returns {Promise<AnalysisInfo[]>} - The selected analysis object.
 */
async function chooseAnalysisToUpdateRunOnMode(account: Account, analysisList: AnalysisInfo[]): Promise<AnalysisInfo[]> {
  const colorAnalysisName = (x: AnalysisInfo) => `${x.name} [${x.run_on === "tago" ? kleur.cyan(x.run_on) : kleur.yellow(x.run_on || "")}]`;

  // Prompts the user to choose an analysis from a list.
  const selectedAnalysis = await chooseFromList(
    analysisList.sort((a) => (a.run_on === "external" ? -1 : 1)).map((x) => ({ value: x, title: colorAnalysisName(x) })),
    "Choose the analysis you want to update the run_on mode for:"
  );

  // Handles the case where the user cancels the selection.
  if (!selectedAnalysis || selectedAnalysis.length === 0) {
    errorHandler("Cancelled.");
    return process.exit(0);
  }

  return selectedAnalysis;
}

/**
 * Sets the run_on mode for one or more TagoIO analyses.
 * @param userInputName - Optional name filter for the analyses to update.
 * @param options - An object containing the environment, mode, and filterMode options.
 * @param options.environment - The name of the environment to use.
 * @param options.mode - The run_on mode to set for the selected analysis.
 * @param options.filterMode - The filter mode to use when retrieving the analysis list.
 */
async function analysisSetMode(userInputName: string | void, options: { environment: string; mode: string; filterMode: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });
  const analysisFilterName = userInputName ? `*${userInputName}*` : undefined;

  // Get analysis list from TagoIO
  const analysisList = await getAnalysisListFromTagoIO(account, analysisFilterName, options.filterMode);
  if (!analysisList || analysisList.length === 0) {
    errorHandler("No analysis found.");
    return;
  }
  infoMSG(`${analysisList.length} analysis found.`);

  // Query user for the analysis to update
  const selectedAnalysis = await chooseAnalysisToUpdateRunOnMode(account, analysisList);

  let mode: string = options.filterMode;
  if (!mode) {
    mode = await pickFromList([{ title: "tago" }, { title: "external" }], {
      message: "Which run_on mode do you want to set for the selected analysis?",
      initial: selectedAnalysis[0].run_on == "tago" ? "external" : "tago",
    });
  }

  // Update analysis run_on mode
  for (const analysis of selectedAnalysis) {
    await account.analysis.edit(analysis.id, { run_on: mode as any });
  }

  successMSG(`${selectedAnalysis.length} Analysis run_on successfully set to: ${mode}`);
}

export { analysisSetMode };
