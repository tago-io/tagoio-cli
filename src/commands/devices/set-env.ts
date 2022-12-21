import prompts from "prompts";
import { getConfigFile, writeToConfigFile } from "../../lib/config-file";
import { errorHandler, successMSG } from "../../lib/messages";

async function setEnvironment(arg?: string) {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  const envList = Object.keys(configFile)
    .filter((x) => typeof configFile[x] !== "string")
    .map((x) => ({ title: x }));

  const initial = envList.findIndex((x) => x.title === configFile.default);
  if (!arg) {
    const response = await prompts({ type: "autocomplete", choices: envList, initial, name: "arg", message: "Choose your environment:" });
    if (!response.arg) {
      process.exit(0);
    }
    arg = response.arg as string;
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
