import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk/out/modules/Account/analysis.types";
import { keyInSelect, keyInYN, question } from "readline-sync";
import { getConfigFile, IEnvironment, writeConfigFileEnv } from "../lib/config-file";
import { errorHandler, highlightMSG, infoMSG, questionMSG } from "../lib/messages";
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
  if (!keyInYN(questionMSG("Do you want to login and create a token now? (Press N to create a token)"), { defaultInput: "N" })) {
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
async function getAnalysisList(account: Account, oldList: IEnvironment["analysisIDList"] = {}) {
  const analysisList = await account.analysis.list({ amount: 35, fields: ["id", "name", "tags"] }).catch(errorHandler);

  if (!analysisList) {
    return {};
  }

  const getName = (analysis: AnalysisInfo) => `[${analysis.id}] ${analysis.name}`;

  const oldIDList = new Set(Object.keys(oldList).map((x) => oldList[x]));
  const analysisOptions = analysisList.map((x) => (oldIDList.has(x.id) ? highlightMSG(getName(x)) : getName(x)));
  const configList: AnalysisInfo[] = analysisList.filter((x) => oldIDList.has(x.id));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const index = keyInSelect(analysisOptions, "Which analysis to take?");
    if (index === -1) {
      break;
    }

    const selectedAnalysis = analysisList[index];
    const configID = configList.findIndex((x) => x.id === selectedAnalysis.id);
    if (configID !== -1) {
      analysisOptions[index] = getName(selectedAnalysis);
      configList.splice(configID);
      continue;
    }
    analysisOptions[index] = `${highlightMSG(getName(selectedAnalysis))}`;
    configList.push(selectedAnalysis);
  }

  const result = configList.reduce((final, an) => {
    final[an.name] = an.id;
    return final;
  }, {} as IEnvironment["analysisIDList"]);

  return result;
}

/**
 *
 * @param param0
 * @returns
 */
async function startConfig({ token, environment }: ConfigOptions) {
  if (!environment) {
    environment = question(questionMSG("Enter a name for this environment: "), { defaultInput: "prod" });
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
  const analysisList = await getAnalysisList(account, configFile[environment]?.analysisIDList);

  const newEnv: IEnvironment = { analysisIDList: analysisList };
  writeConfigFileEnv(environment, newEnv);
}

export { startConfig };
