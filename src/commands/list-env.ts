import { Account } from "@tago-io/sdk";

import { getConfigFile, getProfileRegion, writeToConfigFile } from "../lib/config-file";
import { errorHandler, infoMSG } from "../lib/messages";
import { readToken } from "../lib/token";

/**
 * Updates the environment information in the config file with the latest data from TagoIO API.
 * @param configFile - The parsed config file object.
 * @param envList - The list of environment names to update.
 * @returns The updated config file object.
 * @throws "Config File not found" if the configFile parameter is falsy.
 */
async function fixEnvironments(configFile: ReturnType<typeof getConfigFile>, envList: string[]) {
  if (!configFile) {
    throw "Config File not found";
  }

  for (const env of envList) {
    const environment = configFile[env];
    const token = readToken(env);
    if (!token) {
      continue;
    }
    const region = getProfileRegion(environment);

    const account = new Account({ token, region });
    const profile = await account.profiles.info("current").catch((error) => {
      console.error(`Error getting profile info for ${env}: ${error.message}`);
      return;
    });

    if (profile) {
      const accInfo = await account.info().catch(errorHandler);
      if (!accInfo) {
        return;
      }
      environment.id = profile.info.id;
      environment.profileName = profile.info.name;
      environment.email = accInfo.email;
    } else if (!environment.id && !environment.profileName) {
      environment.id = "N/A";
      environment.profileName = "N/A";
    }
  }

  writeToConfigFile(configFile);

  return configFile;
}

/**
 * Formats the environment JSON object for a given environment.
 * @param configFile - The configuration file object.
 * @param env - The environment to format.
 * @returns The formatted JSON object.
 */
function formatEnvJSON(configFile: ReturnType<typeof getConfigFile>, env: string) {
  if (!configFile) {
    return;
  }
  const environment = configFile[env];
  const json: any = {
    Environment: env,
    ID: environment.id,
    "Profile Name": environment.profileName,
    Email: environment.email,
  };

  if (process.env.TAGOIO_DEFAULT === env) {
    json.Default = "Yes";
  }

  return json;
}

/**
 * Lists all environments from the configuration file.
 * @returns {Promise<void>} A Promise that resolves when the environments are listed.
 */
async function listEnvironment() {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  const environmentList = Object.keys(configFile).filter((key) => typeof configFile[key] !== "string");
  const fixedConfigFile = await fixEnvironments(configFile, environmentList);

  infoMSG("Here is a list of your TagoIO environments: ");
  const result = environmentList.map((x) => formatEnvJSON(fixedConfigFile, x));
  console.table(result);
}

export { listEnvironment };
