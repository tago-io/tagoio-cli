import { execSync } from "child_process";
import { promises as fs } from "fs";

import { Account } from "@tago-io/sdk";

import { getEnvironmentConfig, IConfigFile, IEnvironment } from "../../lib/config-file";
import { getCurrentFolder } from "../../lib/get-current-folder";
import { errorHandler, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { chooseAnalysisListFromConfig } from "../../prompt/choose-analysis-list-config";
import { confirmAnalysisFromConfig } from "../../prompt/confirm-analysis-list";

type EnvConfig = Omit<IConfigFile, "default">;
/**
 * Returns an object containing the paths for analysis, build and current folder.
 * @param config - An object containing the configuration for the environment.
 * @returns An object containing the paths for analysis, build and current folder.
 */
function getPaths(config: EnvConfig) {
  const folderPath = getCurrentFolder();
  const buildPath = config.buildPath || `./build`;
  const analysisPath = config.analysisPath || `./src/analysis`;
  return { analysisPath, buildPath, folderPath };
}

/**
 * Reads the contents of a file and returns it as a base64-encoded string.
 *
 * @param buildedFile - The path to the file to be read.
 * @param scriptName - The name of the script being read.
 * @returns A Promise that resolves to the contents of the file as a base64-encoded string, or null if an error occurs.
 */
async function getScript(buildedFile: string, scriptName: string) {
  return await fs.readFile(buildedFile, { encoding: "base64" }).catch((error) => {
    errorHandler(`Script ${scriptName} file location error: ${error}`);
    return null;
  });
}

/**
 * Deletes the old builded file if it exists.
 *
 * @param buildedFile - The path to the builded file.
 * @returns Promise<void>
 */
async function deleteOldFile(buildedFile: string) {
  if (await fs.stat(buildedFile).catch(() => null)) {
    await fs.unlink(buildedFile);
  }
}

/**
 * Builds and uploads a script to a TagoIO analysis.
 * @param account - The TagoIO account object.
 * @param scriptName - The name of the script file to be uploaded.
 * @param analysisID - The ID of the TagoIO analysis to upload the script to.
 * @param config - The environment configuration object.
 */
async function buildScript(account: Account, scriptName: string, analysisID: string, config: EnvConfig) {
  const { analysisPath, buildPath, folderPath } = getPaths(config);

  const analysisFile = `${analysisPath}/${scriptName}`;
  const buildFile = `${buildPath}/${scriptName.replace(".ts", "")}.tago.js`;
  const buildedFile = `${folderPath}/${buildFile.replace("./", "")}`;

  await deleteOldFile(buildedFile);
  execSync(`analysis-builder ${analysisFile} ${buildFile}`, { stdio: "inherit", cwd: folderPath });

  const script = await getScript(buildedFile, scriptName);
  if (!script) {
    return process.exit();
  }

  await account.analysis
    .uploadScript(analysisID, {
      content: script,
      language: "node",
      name: `${scriptName}.tago.js`,
    })
    .catch((error) => errorHandler(`\n> Script ${scriptName}.ts error: ${error}`))
    .then(() => successMSG(`Script ${scriptName}.ts successfully uploaded to TagoIO!`));

  await account.analysis.edit(analysisID, {
    run_on: "tago",
  });
}

/**
 * Deploys an analysis script to the specified environment. Picks default environment if none is specified.
 * @param cmdScriptName - The name of the script to deploy.
 * @param options - The options for the deployment.
 * @param options.environment - The environment to deploy the script to.
 * @param options.silent - Whether to skip confirmation prompts.
 * @returns void
 */
async function deployAnalysis(cmdScriptName: string, options: { environment: string; silent: boolean }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  // check if script has a file
  let scriptList = config.analysisList.filter((x) => x.fileName);
  if (!cmdScriptName || cmdScriptName === "all") {
    scriptList = await chooseAnalysisListFromConfig(scriptList);
  } else {
    const analysisFound: IEnvironment["analysisList"][0] = searchName(
      cmdScriptName,
      scriptList.map((x) => ({ names: [x.name, x.fileName], value: x }))
    );

    if (!analysisFound) {
      errorHandler(`No analysis found containing name: ${cmdScriptName}`);
      return;
    }

    if (!options.silent) {
      scriptList = await confirmAnalysisFromConfig([analysisFound]);
    }
  }

  if (scriptList.length === 0) {
    errorHandler(`Cancelled`);
    return;
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });
  for (const { id, fileName } of scriptList) {
    await buildScript(account, fileName, id, config);
  }
  process.exit();
}

export { deployAnalysis };
