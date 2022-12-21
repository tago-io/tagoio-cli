import { execSync } from "child_process";
import { promises as fs } from "fs";
import { Account } from "@tago-io/sdk";
import { getEnvironmentConfig, IConfigFile } from "../../lib/config-file";
import { getCurrentFolder } from "../../lib/get-current-folder";
import { errorHandler, successMSG } from "../../lib/messages";

type EnvConfig = Omit<IConfigFile, "default">;
function getPaths(config: EnvConfig) {
  const folderPath = getCurrentFolder();
  const buildPath = config.buildPath || `./build`;
  const analysisPath = config.analysisPath || `./src/analysis`;
  return { analysisPath, buildPath, folderPath };
}

async function getScript(buildedFile: string, scriptName: string) {
  return await fs.readFile(buildedFile, { encoding: "base64" }).catch((error) => {
    errorHandler(`Script ${scriptName} file location error: ${error}`);
    return null;
  });
}

async function deleteOldFile(buildedFile: string) {
  if (await fs.stat(buildedFile).catch(() => null)) {
    await fs.unlink(buildedFile);
  }
}

async function buildScript(account: Account, scriptName: string, analysisID: string, config: EnvConfig) {
  const { analysisPath, buildPath, folderPath } = getPaths(config);

  const analysisFile = `${analysisPath}/${scriptName}.ts`;
  const buildFile = `${buildPath}/${scriptName}.tago.js`;
  const buildedFile = `${folderPath}/${buildFile.replace(".", "")}`;

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

async function deployAnalysis(cmdScriptName: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  let scriptList = Object.keys(config.analysisIDList);
  if (cmdScriptName !== "all") {
    scriptList = scriptList.filter((key) => key.toLowerCase().includes(cmdScriptName));
  }

  const account = new Account({ token: config.profileToken });
  for (const scriptName of scriptList) {
    const analysisID = config.analysisIDList[scriptName];

    await buildScript(account, scriptName, analysisID, config);
  }
  process.exit();
}

export { deployAnalysis };
