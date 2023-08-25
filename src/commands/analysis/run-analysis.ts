import { spawn, SpawnOptions } from "child_process";

import { Account } from "@tago-io/sdk";

import { getEnvironmentConfig, IEnvironment, resolveCLIPath } from "../../lib/config-file";
import { getCurrentFolder } from "../../lib/get-current-folder";
import { errorHandler, highlightMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";

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
  let cmd: string = `SWCRC=true node -r ${resolveCLIPath("/node_modules/@swc-node/register/index")} --watch `;
  if (options.tsnd) {
    cmd = `tsnd `;
    if (options.debug) {
      cmd += "--inspect -- ";
    }
  }

  if (!cmd) {
    errorHandler(`Couldn't run file ${scriptToRun.fileName}`);
    return;
  }

  if (options.debug && !options.tsnd) {
    cmd += "--inspect ";
  }

  if (options.clear) {
    cmd += "--clear ";
  }

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
export { runAnalysis };
