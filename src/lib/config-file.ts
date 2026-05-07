import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GenericModuleParams } from "@tago-io/sdk";
import kleur from "kleur";
import { setEnvironmentVariables } from "./dotenv-config.js";
import { errorHandler, highlightMSG, infoMSG } from "./messages.js";
import { resolveScope, ResolvedScope } from "./resolve-scope.js";
import { readToken } from "./token.js";

interface IEnvironment {
  /** Local-scope only. Omitted from global tagoconfig.json (analysis development requires a project directory). */
  analysisList?: { name: string; fileName: string; id: string; path?: string }[];
  id: string;
  profileName: string;
  email: string;
  tagoSSEURL?: string;
  tagoAPIURL?: string;
}

interface IConfigFileEnvs {
  [key: string]: IEnvironment;
}
interface IConfigFile {
  profileToken?: string;
  profileRegion?: GenericModuleParams["region"];
  analysisPath: string;
  buildPath: string;
  default: string;
}

function resolveCLIPath(suffix: string) {
  let path = import.meta.dirname;
  // Handle windows and linux paths
  const pathSymbol = path.includes("\\") ? "\\" : "/";

  const pathSlices = path.split(pathSymbol);
  const cliWordPosition = pathSlices.findIndex((x) => x.includes("cli")) + 1;
  path = pathSlices.slice(0, cliWordPosition).join(pathSymbol);
  return join(path, suffix).normalize();
}

function getFilePath() {
  return resolveScope().configPath;
}

function describeScope(scope: ResolvedScope): string {
  return `${scope.scope} profile (${scope.configPath})`;
}

function getConfigFile() {
  const configPath = getFilePath();
  // const defaultPaths = { analysisPath: "./src/analysis", buildPath: "./build" };

  if (!existsSync(configPath)) {
    // Local scope: auto-create a schema-stub config so a fresh project starts
    // from a known-good shape. Global scope: do NOT auto-create — the user
    // must opt in via `tagoio init --global` to spawn the global profile.
    if (resolveScope().scope !== "local") {
      return;
    }
    try {
      writeFileSync(configPath, JSON.stringify({ $schema: "https://github.com/tago-io/tagoio-cli/blob/master/docs/schema.json" }), { encoding: "utf-8" });
    } catch (error) {
      errorHandler(error);
    }
  }

  try {
    const configFile = readFileSync(configPath, { encoding: "utf-8" });
    return { ...JSON.parse(configFile) } as IConfigFile & IConfigFileEnvs;
  } catch {
    //any
  }
}

function getProfileRegion(userEnvironment: IEnvironment) {
  let region: GenericModuleParams["region"] = "us-e1";
  if (userEnvironment?.tagoAPIURL) {
    region = {
      api: userEnvironment.tagoAPIURL || "",
      sse: userEnvironment.tagoSSEURL || "",
    };
  }

  return region;
}

function getEnvironmentConfig(environment?: string) {
  const scope = resolveScope();
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  const defaultPaths = { analysisPath: configFile.analysisPath, buildPath: configFile.buildPath };

  if (environment) {
    const userEnvironment = configFile[environment];
    if (!userEnvironment) {
      errorHandler(`Environment '${environment}' not found in ${describeScope(scope)}`);
    }
    const profileRegion = getProfileRegion(userEnvironment);
    const profileToken = readToken(environment);

    const profileInfo = kleur.dim(`[${userEnvironment.profileName}] [${userEnvironment.email}]`);
    infoMSG(`Using environment: ${highlightMSG(environment)} ${profileInfo}`);

    return { ...configFile[environment], ...defaultPaths, profileToken, profileRegion };
  }

  const defaultEnvName = process.env.TAGOIO_DEFAULT as string;
  if (!defaultEnvName) {
    errorHandler(`No environment found in ${describeScope(scope)}. Set one with ${kleur.italic("tagoio set-env <environment>")}`);
  }

  const defaultEnvironment = configFile[defaultEnvName];
  if (!defaultEnvironment) {
    errorHandler(`Default Environment '${defaultEnvName}' not found in ${describeScope(scope)}`);
  }
  const profileRegion = getProfileRegion(defaultEnvironment);
  const profileToken = readToken(defaultEnvName);

  const profileInfo = kleur.dim(`[${defaultEnvironment.profileName}] [${defaultEnvironment.email}]`);
  infoMSG(`Using default environment: ${highlightMSG(defaultEnvName)} ${profileInfo}`);

  return { ...defaultEnvironment, ...defaultPaths, profileToken, profileRegion };
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
  // Always persist this env as the active default for the resolved scope.
  // The previous guard skipped the write when process.env.TAGOIO_DEFAULT was
  // already set from another scope's personal.env loaded at startup, which
  // left the current scope's personal.env empty.
  setEnvironmentVariables({ TAGOIO_DEFAULT: environment });

  writeFileSync(configPath, JSON.stringify(configFile, null, 4), { encoding: "utf-8" });
}

function writeToConfigFile(configFile: IConfigFile & IConfigFileEnvs) {
  const configPath = getFilePath();

  writeFileSync(configPath, JSON.stringify(configFile, null, 4), { encoding: "utf-8" });
}

function setDefault(environment: string) {
  const scope = resolveScope();
  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  if (!configFile[environment]) {
    errorHandler(`Environment '${environment}' is not in ${describeScope(scope)}`);
  }

  configFile.default = environment;
  const configPath = getFilePath();
  writeFileSync(configPath, JSON.stringify(configFile), { encoding: "utf-8" });
}

export { getConfigFile, getEnvironmentConfig, writeConfigFileEnv, writeToConfigFile, setDefault, resolveCLIPath, getProfileRegion, IConfigFile, IEnvironment };
