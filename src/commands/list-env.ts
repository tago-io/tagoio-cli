import { getConfigFile } from "../lib/config-file";
import { highlightMSG, infoMSG, successMSG } from "../lib/messages";

async function listEnvironment(options: { default: boolean }) {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }
  if (options.default) {
    successMSG(`Your current default environment is: ${highlightMSG(configFile.default || "N/A")} `);
  }

  infoMSG("Here's a list of your environments: ");
  const environmentList = Object.keys(configFile).filter((key) => typeof configFile[key] !== "string");
  console.table(environmentList);
}

export { listEnvironment };
