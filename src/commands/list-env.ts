import { Account } from "@tago-io/sdk";
import { getConfigFile, writeToConfigFile } from "../lib/config-file";
import { infoMSG } from "../lib/messages";
import { readToken } from "../lib/token";

async function fixEnvironments(configFile: ReturnType<typeof getConfigFile>, envList: string[]) {
  if (!configFile) {
    throw "Config File not found";
  }

  for (const env of envList) {
    const environment = configFile[env];
    // if (environment.id && environment.profileName) {
    //   continue;
    // }

    const token = readToken(env);
    if (!token) {
      continue;
    }

    const account = new Account({ token });
    const profile = await account.profiles.info("current");
    const accInfo = await account.info();
    environment.id = profile.info.id;
    environment.profileName = profile.info.name;
    environment.email = accInfo.email;
  }

  writeToConfigFile(configFile);

  return configFile;
}

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

async function listEnvironment() {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  const environmentList = Object.keys(configFile).filter((key) => typeof configFile[key] !== "string");
  const fixedConfigFile = await fixEnvironments(configFile, environmentList);

  infoMSG("Here's a list of your environments: ");
  const result = environmentList.map((x) => formatEnvJSON(fixedConfigFile, x));
  console.table(result);
}

export { listEnvironment };
