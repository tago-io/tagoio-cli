import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk/out/modules/Account/analysis.types";
import prompts from "prompts";
import { errorHandler } from "../lib/messages";

async function chooseAnalysisFromTagoIO(account: Account, message: string = "Choose the analysis") {
  const analysisList = await account.analysis.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);
  if (!analysisList) {
    return;
  }

  const { script } = await prompts({
    message,
    name: "script",
    type: "autocompleteMultiselect",
    choices: analysisList.map((x) => ({ title: `${x.name} [${x.id}]`, value: x })),
  });

  return (script || []) as AnalysisInfo[];
}

export { chooseAnalysisFromTagoIO };
