import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import kleur from "kleur";

import { setEnvironmentVariables } from "./dotenv-config";
import { getCurrentFolder } from "./get-current-folder";
import { errorHandler, highlightMSG, infoMSG } from "./messages";
import { readToken } from "./token";

interface IEnvironment {
  analysisList: { name: string; fileName: string; id: string }[];
  id: string;
  profileName: string;
  email: string;
}

interface IConfigFileEnvs {
  [key: string]: IEnvironment;
}
interface IConfigFile {
  profileToken?: string;
  tagoDeployUrl?: string;
  analysisPath: string;
  buildPath: string;
  default: string;
}

function resolveCLIPath(suffix: string) {
  let path = __dirname;
  // Handle windows and linux paths
  const pathSymbol = path.includes("\\") ? "\\" : "/";

  const pathSlices = path.split(pathSymbol);
  const cliWordPosition = pathSlices.findIndex((x) => x.includes("cli")) + 1;
  path = pathSlices.slice(0, cliWordPosition).join(pathSymbol);
  return join(path, suffix);
}

function getFilePath() {
  const folder = getCurrentFolder();
  return `${folder}/tagoconfig.json`;
}

function getConfigFile() {
  const configPath = getFilePath();
  // const defaultPaths = { analysisPath: "./src/analysis", buildPath: "./build" };

  try {
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify({ $schema: "https://github.com/tago-io/tagoio-cli/blob/master/docs/schema.json" }), { encoding: "utf-8" });
    }
  } catch (error) {
    errorHandler(error);
    return;
  }

  try {
    const configFile = readFileSync(configPath, { encoding: "utf-8" });
    return { ...JSON.parse(configFile) } as IConfigFile & IConfigFileEnvs;
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
    const userEnvironment = configFile[environment];
    if (!userEnvironment) {
      errorHandler(`Environment not found: ${environment}`);
    }
    const profileInfo = kleur.dim(`[${userEnvironment.profileName}] [${userEnvironment.email}]`);
    infoMSG(`Using environment: ${highlightMSG(environment)} ${profileInfo}\n`);
    return { ...configFile[environment], ...defaultPaths, profileToken: readToken(environment) };
  }

  const defaultEnvName = process.env.TAGOIO_DEFAULT as string;
  if (!defaultEnvName) {
    errorHandler(`No environment found. Set one with ${kleur.italic("tagoio set-env <environment>")}`);
  }

  const defaultEnvironment = configFile[defaultEnvName];
  const profileInfo = kleur.dim(`[${defaultEnvironment.profileName}] [${defaultEnvironment.email}]`);
  infoMSG(`Using default environment: ${highlightMSG(defaultEnvName)} ${profileInfo}\n`);
  return { ...defaultEnvironment, ...defaultPaths, profileToken: readToken(defaultEnvName) };
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
  if (!process.env.TAGOIO_DEFAULT) {
    setEnvironmentVariables({ TAGOIO_DEFAULT: environment });
  }

  writeFileSync(configPath, JSON.stringify(configFile, null, 4), { encoding: "utf-8" });
}

function writeToConfigFile(configFile: IConfigFile & IConfigFileEnvs) {
  const configPath = getFilePath();

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

export { getConfigFile, getEnvironmentConfig, writeConfigFileEnv, writeToConfigFile, setDefault, resolveCLIPath, IConfigFile, IEnvironment };
