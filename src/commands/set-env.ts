import { getConfigFile } from "../lib/config-file.js";
import { setEnvironmentVariables } from "../lib/dotenv-config.js";
import { errorHandler, successMSG } from "../lib/messages.js";
import { pickEnvironment } from "../prompt/pick-environment.js";

async function setEnvironment(arg?: string) {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  if (!arg) {
    arg = await pickEnvironment();
  }

  if (!arg) {
    process.exit(0);
  }

  if (!configFile[arg]) {
    errorHandler(`Environment doesn't exist in the tagoconfig.json: ${arg}`);
  }

  setEnvironmentVariables({ TAGOIO_DEFAULT: arg });
  successMSG(`The default environment has been successfully set to: ${arg}`);
}

export { setEnvironment };
