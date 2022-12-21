import { getConfigFile, writeToConfigFile } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";

async function setEnvironment(arg: string) {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  if (!configFile[arg]) {
    errorHandler(`Environment doesn't exist in the tagoconfig.json: ${arg}`);
    return;
  }

  configFile.default = arg;

  writeToConfigFile(configFile);
  successMSG(`Default environment is set to: ${arg}`);
}

export { setEnvironment };
