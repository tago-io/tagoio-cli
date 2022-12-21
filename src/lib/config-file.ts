import { existsSync, readFileSync, writeFileSync } from "fs";
import { getCurrentFolder } from "./get-current-folder";
import { errorHandler } from "./messages";
import { readToken } from "./token";

interface IEnvironment {
  analysisIDList: { [key: string]: string };
}

interface IConfigFileEnvs {
  [key: string]: IEnvironment;
}
interface IConfigFile {
  profileToken?: string;
  analysisPath: string;
  buildPath: string;
  default: string;
}

function getFilePath() {
  const folder = getCurrentFolder();
  return `${folder}/tagoconfig.json`;
}

function getConfigFile() {
  const configPath = getFilePath();
  const defaultPaths = { analysisPath: "./src/analysis", buildPath: "./build" };

  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(defaultPaths), { encoding: "utf-8" });
    }
  } catch (error) {
    errorHandler(error);
    return;
  }

  try {
    const configFile = readFileSync(configPath, { encoding: "utf-8" });
    return { ...defaultPaths, ...JSON.parse(configFile) } as IConfigFile & IConfigFileEnvs;
  } catch {
    //any
  }
}

function getEnvironmentConfig(environment?: string) {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  const defaultPaths = { analysisPath: configFile.analysisPath, buildPath: configFile.buildPath };

  if (environment) {
    return { ...configFile[environment], ...defaultPaths, profileToken: readToken(environment) };
  }

  if (configFile.default) {
    return { ...configFile[configFile.default], ...defaultPaths, profileToken: readToken(configFile.default) };
  }
}

function writeConfigFileEnv(environment: string, data: IEnvironment) {
  const configPath = getFilePath();
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  // @ts-expect-error token is set by functions
  delete data.profileToken;
  configFile[environment] = data;

  writeFileSync(configPath, JSON.stringify(configFile, null, 4), { encoding: "utf-8" });
}

function setDefault(environment: string) {
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  if (!configFile[environment]) {
    errorHandler(`Environment ${environment} is not in the tagoconfig.json`);
    return;
  }

  configFile.default = environment;
  const configPath = getFilePath();
  writeFileSync(configPath, JSON.stringify(configFile), { encoding: "utf-8" });
}

export { getConfigFile, getEnvironmentConfig, writeConfigFileEnv, setDefault, IConfigFile, IEnvironment };
