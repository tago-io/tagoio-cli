import prompts from "prompts";

import { getConfigFile } from "../lib/config-file";
import { errorHandler } from "../lib/messages";

async function pickEnvironment(message: string = "Choose your environment:") {
  const configFile = getConfigFile();
  if (!configFile) {
    errorHandler("Couldnt load config file");
    process.exit(0);
  }

  const envList = Object.keys(configFile)
    .filter((x) => typeof configFile[x] !== "string")
    .map((x) => ({ title: x }));

  const initial = envList.findIndex((x) => x.title === process.env.TAGOIO_DEFAULT);
  const { environment } = await prompts({ type: "autocomplete", choices: envList, initial, name: "environment", message });

  if (!environment) {
    errorHandler("Environment not selected");
    process.exit(0);
  }

  return environment as string;
}

export { pickEnvironment };
