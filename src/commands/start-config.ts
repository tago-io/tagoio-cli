import { readdirSync } from "fs";
import kleur from "kleur";
import prompts, { Choice } from "prompts";
import stringComparison from "string-comparison";

import { Account } from "@tago-io/sdk";
import { AnalysisInfo } from "@tago-io/sdk/lib/types";

import { getConfigFile, IEnvironment, writeConfigFileEnv, writeToConfigFile } from "../lib/config-file";
import { errorHandler, highlightMSG, infoMSG } from "../lib/messages";
import { readToken, writeToken } from "../lib/token";
import { promptTextToEnter } from "../prompt/text-prompt";
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
  infoMSG(`You can create a token by running: ${highlightMSG("tagoio login")}`);

  const options = { token: undefined };
  await tagoLogin(environment, options);

  return options.token;
}

async function chooseAnalysis(analysisOptions: any[]) {
  const { response } = await prompts({
    type: "autocompleteMultiselect",
    limit: 20,
    choices: analysisOptions,
    message: "Which analysis to take?",
    name: "response",
  });
  return (response || []) as AnalysisInfo[];
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
  const response = await chooseAnalysis(analysisOptions);

  const formatFileName = (x: string) => x.toLowerCase().replace(" ", "-");
  const analysisResult: IEnvironment["analysisList"] = response.map((x) => ({
    fileName: formatFileName(x.name),
    name: x.name,
    id: x.id,
    ...oldList.find((old) => old.id === x.id),
  }));

  return analysisResult;
}

async function getAnalysisScripts(analysisList: IEnvironment["analysisList"], analysisPath: string) {
  infoMSG(`Searching for files at ${analysisPath}`);
  let files: Choice[] = readdirSync(analysisPath)
    .filter((x) => x.endsWith(".ts") || x.endsWith(".js") || x.endsWith(".py"))
    .map((x) => ({ title: x }));

  for (const analysis of analysisList) {
    files = files.sort((a, b) =>
      stringComparison.cosine.distance(analysis.name, a.title) > stringComparison.cosine.distance(analysis.name, b.title) ? 1 : -1
    );

    const editFile = files.find((x) => x.title === analysis.fileName);
    const { response } = await prompts({
      type: "autocomplete",
      limit: 20,
      choices: files.concat([{ title: "> Skip", value: ">skip-selector" }]),
      message: `Which analysis do you want to relate to ${highlightMSG(analysis.name)}`,
      name: "response",
      initial: editFile?.title,
    });

    if (response === ">skip-selector") {
      analysis.fileName = "";
      continue;
    }

    const fileIndex = files.findIndex((x) => x.title === response);
    if (fileIndex !== -1) {
      files.splice(fileIndex, 1);
    }

    analysis.fileName = response;
  }
  return analysisList;
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

  if (!configFile.analysisPath) {
    configFile.analysisPath = await promptTextToEnter(`Enter the path of your ${kleur.cyan("analysis")} folder: `, "./src/analysis");
  }

  if (!configFile.buildPath) {
    configFile.buildPath = await promptTextToEnter(`Enter the path of your ${kleur.cyan("building")} folder (typescript): `, "./build");
  }

  if (!token) {
    return;
  }

  const account = new Account({ token });
  const profile = await account.profiles.info("current");
  const accountInfo = await account.info();
  let analysisList = await getAnalysisList(account, configFile[environment]?.analysisList);
  analysisList = await getAnalysisScripts(analysisList, configFile.analysisPath);

  const newEnv: IEnvironment = { analysisList: analysisList, id: profile.info.id, profileName: profile.info.name, email: accountInfo.email };
  writeToConfigFile(configFile);
  writeConfigFileEnv(environment, newEnv);
}

export { startConfig };
