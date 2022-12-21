import { Account } from "@tago-io/sdk";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler } from "../../lib/messages";

async function triggerAnalysis(scriptName: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  let scriptList = Object.keys(config.analysisIDList);
  scriptList = scriptList.filter((key) => key.toLowerCase().includes(scriptName.toLowerCase()));
  // scriptList = scriptList.filter((key) => cmd.find((x) => key.toLowerCase().includes(x)));

  const account = new Account({ token: config.profileToken });
  for (const script_name of scriptList) {
    const analysisID = config.analysisIDList[script_name];
    console.log(`> Analysis found: ${script_name} [${analysisID}].`);
    await account.analysis.run(analysisID).then(console.log);
  }
}

export { triggerAnalysis };
