import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk/out/modules/Account/analysis.types";
import kleur from "kleur";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages";
import { chooseFromList } from "../../prompt/choose-from-list";
import { pickFromList } from "../../prompt/pick-from-list";

async function analysisSetMode(userInputName: string | void, options: { environment: string; mode: string; filterMode: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });
  const analysisFilterName = userInputName ? `*${userInputName}*` : undefined;

  const analysisList = await account.analysis
    .list({
      amount: 100,
      filter: { name: analysisFilterName },
      fields: ["id", "name", "run_on"],
    })
    .then((r) => (options.filterMode ? r.filter((x) => x.run_on === options.filterMode) : r))
    .catch(errorHandler);

  if (!analysisList) {
    return;
  }

  infoMSG(`${analysisList.length} Analysis found`);
  if (analysisList.length === 0) {
    return;
  }

  const renameAnalysis = (x: AnalysisInfo) => `${x.name} [${x.run_on === "tago" ? kleur.cyan(x.run_on) : kleur.yellow(x.run_on || "")}]`;
  const selectedAnalysis = await chooseFromList(
    analysisList.sort((a) => (a.run_on === "external" ? -1 : 1)).map((x) => ({ value: x, title: renameAnalysis(x) })),
    "Choose the analysis to update: "
  );

  if (!selectedAnalysis || selectedAnalysis.length === 0) {
    errorHandler("Cancelled.");
    return;
  }

  let mode: string = options.filterMode;
  if (!mode) {
    mode = await pickFromList([{ title: "tago" }, { title: "external" }], {
      message: "You want to change run_on to?",
      initial: selectedAnalysis[0].run_on == "tago" ? "external" : "tago",
    });
  }

  for (const analysis of selectedAnalysis) {
    await account.analysis.edit(analysis.id, { run_on: mode as any });
  }

  successMSG(`${selectedAnalysis.length} Analysis run_on succesfully set to: ${mode}`);
}

export { analysisSetMode };
