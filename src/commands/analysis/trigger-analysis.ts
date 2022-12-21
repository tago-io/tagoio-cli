import { Account } from "@tago-io/sdk";
import { getEnvironmentConfig } from "../../lib/config-file";
import { errorHandler } from "../../lib/messages";
import { searchName } from "./deploy";

async function triggerAnalysis(scriptName: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const scriptList = config.analysisList.filter((x) => searchName(scriptName, x.fileName, x.name));
  // scriptList = scriptList.filter((key) => cmd.find((x) => key.toLowerCase().includes(x)));

  const account = new Account({ token: config.profileToken });
  for (const { id: analysisID, fileName } of scriptList) {
    console.log(`> Analysis found: ${fileName} [${analysisID}].`);
    await account.analysis.run(analysisID).then(console.log);
  }
}

export { triggerAnalysis };
