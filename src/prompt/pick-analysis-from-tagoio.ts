import prompts from "prompts";

import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk/lib/types";

import { errorHandler } from "../lib/messages";

async function pickAnalysisFromTagoIO(account: Account, message: string = "Choose the analysis"): Promise<AnalysisInfo> {
  const analysisList = await account.analysis.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);
  if (!analysisList) {
    errorHandler("Cancelled");
    process.exit(0);
  }

  const { script } = await prompts({
    message,
    name: "script",
    type: "autocomplete",
    choices: analysisList.map((x) => ({ title: `${x.name} [${x.id}]`, value: x })),
  });

  if (!script) {
    errorHandler("Cancelled");
    process.exit(0);
  }

  return script as AnalysisInfo;
}
export { pickAnalysisFromTagoIO };
