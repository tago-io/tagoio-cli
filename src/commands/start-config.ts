import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk/out/modules/Account/analysis.types";
import prompts from "prompts";
import { getConfigFile, IEnvironment, writeConfigFileEnv } from "../lib/config-file";
import { errorHandler, highlightMSG, infoMSG } from "../lib/messages";
import { readToken, writeToken } from "../lib/token";
import { tagoLogin } from "./login";

interface ConfigOptions {
  token: string | void;
  environment: string | void;
}

/**
 *
 * @param environment
 * @returns
 */
async function createEnvironmentToken(environment: string) {
  const { tryLogin } = await prompts({
    message: "Do you want to login and create a token now?",
    type: "confirm",
    name: "tryLogin",
    hint: "Press N to enter a token later",
  });
  if (!tryLogin) {
    return;
  }
  infoMSG(`You can create a token by running: ${highlightMSG("tagoio-cli login")}`);

  const options = { token: undefined };
  await tagoLogin(environment, options);

  return options.token;
}

/**
 *
 * @param account
 * @param oldList
 * @returns
 */
async function getAnalysisList(account: Account, oldList: IEnvironment["analysisList"] = []) {
  const analysisList = await account.analysis.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);

  if (!analysisList) {
    return [];
  }

  const getName = (analysis: AnalysisInfo) => `[${analysis.id}] ${analysis.name}`;

  const oldIDList = new Set(oldList.map((x) => x.id));
  const configList: AnalysisInfo[] = analysisList.filter((x) => oldIDList.has(x.id));

  const analysisOptions = analysisList.map((x) => ({ title: getName(x), selected: configList.some((y) => y.id === x.id), value: x }));
  const { response } = await prompts({
    type: "autocompleteMultiselect",
    limit: 20,
    choices: analysisOptions,
    message: "Which analysis to take?",
    name: "response",
  });

  const formatFileName = (x: string) => x.toLowerCase().replace(" ", "-");
  const result: IEnvironment["analysisList"] = (response as AnalysisInfo[]).map((x) => ({
    fileName: formatFileName(x.name),
    name: x.name,
    id: x.id,
    ...oldList.find((old) => old.id === x.id),
  }));

  return result;
}

/**
 *
 * @param param0
 * @returns
 */
async function startConfig(environment: string, { token }: ConfigOptions) {
  if (!environment) {
    ({ environment } = await prompts({ message: "Enter a name for this environment: ", type: "text", name: "environment" }));
  }

  const configFile = getConfigFile();
  if (!configFile) {
    return;
  }

  if (!token) {
    token = readToken(environment);
    if (!token) {
      token = await createEnvironmentToken(environment);
    }
  } else {
    writeToken(token, environment);
  }

  if (!token) {
    return;
  }

  const account = new Account({ token });
  const analysisList = await getAnalysisList(account, configFile[environment]?.analysisList);

  const newEnv: IEnvironment = { analysisList: analysisList };
  writeConfigFileEnv(environment, newEnv);
}

export { startConfig };
