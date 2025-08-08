import { spawn, SpawnOptions } from "node:child_process";
import path from "node:path";

import { Account } from "@tago-io/sdk";

import { getEnvironmentConfig, IEnvironment, resolveCLIPath } from "../../lib/config-file";
import { getCurrentFolder } from "../../lib/get-current-folder";
import { errorHandler, highlightMSG, successMSG } from "../../lib/messages";
import { searchName } from "../../lib/search-name";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config";
import { detectRuntime } from "../../lib/current-runtime";

/**
 * Builds the command to run the analysis.
 * @param options - The options to configure the command.
 * @param options.tsnd - Whether to use `tsnd` to run the command.
 * @param options.debug - Whether to enable debugging for the command.
 * @param options.clear - Whether to clear the console before running the command.
 * @param options.runtime - The runtime to use ('deno' or 'node').
 * @returns The built command as a string.
 */
function _buildCMD(options: { tsnd: boolean; debug: boolean; clear: boolean}, runtimeParam: string): string {
  let cmd: string = "";
  const runtime = runtimeParam === "--deno" ? "deno" : "node";

  if (runtime === "deno") {
    cmd = `deno run --allow-all --watch `;
    if (options.debug) {
      cmd += "--inspect ";
    }
  } else {
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
  }

  return cmd;
}

/**
 * Runs an analysis script.
 * @param scriptName - The name of the script to run.
 * @param options - The options for running the script.
 * @returns void
 */
async function runAnalysis(scriptName: string | undefined, options: { environment: string; debug: boolean; clear: boolean; tsnd: boolean; deno: boolean; node: boolean }) {
  let runtime;
  if (options.deno && options.node) {
    console.error('Error: Cannot specify both --deno and --node flags');
    process.exit(1);
  } else if (options.deno) {
    runtime = '--deno';
  } else if (options.node) {
    runtime = '--node';
  } else {
    runtime = detectRuntime();
  }
  
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

  const account = new Account({ token: config.profileToken, region: config.profileRegion });

  let { token: analysisToken, run_on, name } = await account.analysis.info(scriptToRun.id);
  successMSG(`> Analysis found: ${highlightMSG(scriptToRun.fileName)} (${name}}) [${highlightMSG(analysisToken)}].`);

  const analysisEnv: { [key: string]: string } = {
    ...process.env,
    T_EXTERNAL: "external",
    T_ANALYSIS_TOKEN: analysisToken,
    T_ANALYSIS_ID: scriptToRun.id,
  }

  if (typeof config.profileRegion === "object") {
    analysisEnv.TAGOIO_API = config.profileRegion.api;
    if (config.profileRegion.realtime) {
      analysisEnv.TAGOIO_REALTIME = config.profileRegion.realtime;
    }
    if (config.profileRegion.sse) {
      analysisEnv.TAGOIO_SSE = config.profileRegion.sse;
    }
  }

  const spawnOptions: SpawnOptions = {
    shell: true,
    cwd: getCurrentFolder(),
    stdio: "inherit",
    env: analysisEnv,
  };

  const scriptPath = path.join(config.analysisPath, scriptToRun.fileName).normalize();
  const cmd = _buildCMD(options, runtime);

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
