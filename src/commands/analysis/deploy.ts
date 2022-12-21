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

function searchName(key: string, ...args: string[]) {
  return args.some((x) => x.toLowerCase().includes(key.toLowerCase()));
}

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

async function deployAnalysis(cmdScriptName: string, options: { environment: string }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  let scriptList = config.analysisList;
  console.log(scriptList);
  if (cmdScriptName !== "all") {
    scriptList = scriptList.filter((x) => searchName(cmdScriptName, x.fileName, x.name));
  }

  if (scriptList.length === 0) {
    errorHandler(`No analysis found containing name: ${cmdScriptName}`);
    return;
  }

  const account = new Account({ token: config.profileToken });
  for (const { id, fileName } of scriptList) {
    await buildScript(account, fileName, id, config);
  }
  process.exit();
}

export { deployAnalysis, searchName };
