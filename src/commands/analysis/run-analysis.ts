import { spawn, SpawnOptions } from "child_process";

import { Account } from "@tago-io/sdk";

import { getEnvironmentConfig, IEnvironment, resolveCLIPath } from "../../lib/config-file";
import { getCurrentFolder } from "../../lib/get-current-folder";
import { errorHandler, highlightMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";

/**
 * Builds the command to run the analysis.
 * @param options - The options to configure the command.
 * @param options.tsnd - Whether to use `tsnd` to run the command.
 * @param options.debug - Whether to enable debugging for the command.
 * @param options.clear - Whether to clear the console before running the command.
 * @returns The built command as a string.
 */
function _buildCMD(options: { tsnd: boolean; debug: boolean; clear: boolean }): string {
  let cmd: string = "";

  switch (options.tsnd) {
    case true: {
      cmd = `tsnd `;
      if (options.debug) {
        cmd += "--inspect -- ";
      }
      break;
    }

    default: {
      cmd = `node -r ${resolveCLIPath("/node_modules/@swc-node/register/index")} --watch `;
      if (options.debug) {
        cmd += "--inspect ";
      }
      break;
    }
  }

  if (options.clear) {
    cmd += "--clear ";
  }

  return cmd;
}

/**
 * Runs an analysis script.
 * @param scriptName - The name of the script to run.
 * @param options - The options for running the script.
 * @returns void
 */
async function runAnalysis(scriptName: string | undefined, options: { environment: string; debug: boolean; clear: boolean; tsnd: boolean }) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
    return;
  }

  const analysisList = config.analysisList.filter((x) => x.fileName);
  let scriptToRun: IEnvironment["analysisList"][0];
  if (scriptName) {
    scriptName = scriptName.toLowerCase();
    scriptToRun = searchName(
      scriptName,
      analysisList.map((x) => ({ names: [x.name, x.fileName], value: x }))
    );
  } else {
    scriptToRun = await pickAnalysisFromConfig(analysisList);
  }

  if (!scriptToRun || !scriptToRun.id) {
    errorHandler(`Analysis couldn't be found: ${scriptName}`);
    return process.exit();
  }

  const account = new Account({ token: config.profileToken, region: "usa-1" });

  let { token: analysisToken, run_on, name } = await account.analysis.info(scriptToRun.id);
  successMSG(`> Analysis found: ${highlightMSG(scriptToRun.fileName)} (${name}}) [${highlightMSG(analysisToken)}].`);

  const spawnOptions: SpawnOptions = {
    shell: true,
    cwd: getCurrentFolder(),
    stdio: "inherit",
    env: {
      ...process.env,
      T_EXTERNAL: "external",
      T_ANALYSIS_TOKEN: analysisToken,
      T_ANALYSIS_ID: scriptToRun.id,
    },
  };

  const scriptPath = `${config.analysisPath}/${scriptToRun.fileName}`;
  const cmd = _buildCMD(options);

  if (run_on === "tago") {
    await account.analysis.edit(scriptToRun.id, { run_on: "external" });
    await new Promise((resolve) => setTimeout(resolve, 200)); // sleep
    ({ token: analysisToken, run_on, name } = await account.analysis.info(scriptToRun.id));
    if (spawnOptions?.env) {
      spawnOptions.env.T_ANALYSIS_TOKEN = analysisToken;
    }
  }
  const spawnProccess = spawn(`${cmd}${scriptPath}`, spawnOptions);

  const killAnalysis = async () => await account.analysis.edit(scriptToRun.id, { run_on: "tago" });
  spawnProccess.on("close", killAnalysis);
  spawnProccess.on("SIGINT", killAnalysis);
}
export { runAnalysis, _buildCMD };
