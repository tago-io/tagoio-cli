import prompts from "prompts";

import { getConfigFile } from "../lib/config-file.js";
import { errorHandler } from "../lib/messages.js";

async function pickEnvironment(message: string = "Choose your environment:") {
  const configFile = getConfigFile();
  if (!configFile) {
    errorHandler("Couldnt load config file");
  }

  const envList = Object.keys(configFile)
    .filter((x) => typeof configFile[x] !== "string")
    .map((x) => ({ title: x }));

  const initial = envList.findIndex((x) => x.title === process.env.TAGOIO_DEFAULT);
  const { environment } = await prompts({ type: "autocomplete", choices: envList, initial, name: "environment", message });

  if (!environment) {
    errorHandler("Environment not selected");
  }

  return environment as string;
}

export { pickEnvironment };
