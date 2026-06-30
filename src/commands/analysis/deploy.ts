import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";

import { Account, RunTypeOptions } from "@tago-io/sdk";

import { getEnvironmentConfig, IConfigFile, IEnvironment } from "../../lib/config-file.js";
import { detectRuntime } from "../../lib/current-runtime.js";
import { errorHandler, infoMSG, successMSG } from "../../lib/messages.js";
import { requireLocalScope } from "../../lib/resolve-scope.js";
import { printScopeBanner } from "../../lib/scope-notice.js";
import { searchName } from "../../lib/search-name.js";
import { chooseAnalysisListFromConfig } from "../../prompt/choose-analysis-list-config.js";
import { confirmAnalysisFromConfig } from "../../prompt/confirm-analysis-list.js";

type EnvConfig = Omit<IConfigFile, "default">;

interface BuildScriptParams {
  account: Account;
  scriptName: string;
  analysisID: string;
  config: EnvConfig;
  runtime: string;
  path: string;
  /** Resolved local-scope project root. */
  projectRoot: string;
}

/**
 * Returns an object containing the paths for analysis, build and current folder.
 * @param config - An object containing the configuration for the environment.
 * @returns An object containing the paths for analysis, build and current folder.
 */
function getPaths(config: EnvConfig, projectRoot: string) {
  const buildPath = config.buildPath || `./build`;
  const analysisPath = config.analysisPath || `./src/analysis`;
  return { analysisPath, buildPath, folderPath: projectRoot };
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
 * @param params - The parameters for building and uploading the script.
 */
async function buildScript(params: BuildScriptParams) {
  const { account, scriptName, analysisID, config, runtime, path, projectRoot } = params;
  const { analysisPath, buildPath, folderPath } = getPaths(config, projectRoot);

  let analysisFile;
  if (path) {
    analysisFile = `${analysisPath}/${path}/${scriptName}`;
  } else {
    analysisFile = `${analysisPath}/${scriptName}`;
  }
  const buildFile = `${buildPath}/${scriptName.replace(".ts", "")}.tago.js`;
  const buildedFile = `${folderPath}/${buildFile.replace("./", "")}`;

  await deleteOldFile(buildedFile);
  try {
    if (runtime === "--deno") {
      infoMSG("Bundling with deno");
      execSync(`deno bundle ${analysisFile} -o ${buildFile}`, { stdio: "inherit", cwd: folderPath });
    } else {
      execSync(`analysis-builder ${analysisFile} ${buildFile}`, { stdio: "inherit", cwd: folderPath });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const status = (err as { status?: number }).status;
    const code = (err as NodeJS.ErrnoException).code;
    if (status === 127 || code === "ENOENT") {
      const tool = runtime === "--deno" ? "deno" : "@tago-io/builder";
      const hint = runtime === "--deno" ? "Install deno from https://deno.land" : "Install it with: npm install -g @tago-io/builder";
      errorHandler(`Build tool '${tool}' not found. ${hint}`);
    }
    errorHandler(`Build failed for ${scriptName}: ${err.message}`);
  }

  const script = await getScript(buildedFile, scriptName);
  if (!script) {
    return;
  }

  const analysis = await account.analysis.info(analysisID).catch((error) => errorHandler(`\n> Analysis ${scriptName} error: ${error}`));
  if (!analysis) {
    return;
  }

  await account.analysis
    .uploadScript(analysisID, {
      content: script,
      name: `${scriptName}.tago.js`,
      language: analysis.runtime || ((runtime === "--deno" ? "deno-rt2025" : "node-rt2025") as RunTypeOptions),
    })
    .catch((error) => errorHandler(`Script upload failed. script=${scriptName} error=${error}`))
    .then(() => successMSG(`Script uploaded. script=${scriptName} analysis=${analysisID}`));

  await account.analysis.edit(analysisID, {
    run_on: "tago",
  });
}

interface IDeployOptions {
  environment: string;
  silent: boolean;
  deno: boolean;
  node: boolean;
  /** Deploy every analysis from tagoconfig.json without prompting (for CI/CD). */
  all: boolean;
  /** Profile token for this invocation, bypassing the lock file (for CI/CD). */
  token?: string;
}

/**
 * Deploys an analysis script to the specified environment. Picks default environment if none is specified.
 * @param cmdScriptName - The name of the script to deploy.
 * @param options - The options for the deployment.
 * @returns void
 */
async function deployAnalysis(cmdScriptName: string, options: IDeployOptions) {
  if (cmdScriptName === "all") {
    errorHandler('Did you mean "tagoio deploy --all"? The "all" positional argument is no longer supported.');
  }

  // Analysis development requires a project directory.
  const scope = requireLocalScope("analysis-deploy");
  printScopeBanner(scope, options.silent);

  const config = getEnvironmentConfig(options.environment);
  if (!config) {
    errorHandler("Environment not found");
  }

  if (options.token) {
    config.profileToken = options.token;
  }
  if (!config.profileToken) {
    errorHandler("No profile token found. Pass --token or run 'tagoio login'.");
  }

  // --all skips selection entirely; everything in analysisList with a fileName ships.
  let scriptList = (config.analysisList ?? []).filter((x) => x.fileName);
  if (!options.all) {
    if (!cmdScriptName) {
      scriptList = await chooseAnalysisListFromConfig(scriptList);
    } else {
      const analysisFound: NonNullable<IEnvironment["analysisList"]>[number] = searchName(
        cmdScriptName,
        scriptList.map((x) => ({ names: [x.name, x.fileName], value: x })),
      );

      if (!analysisFound) {
        errorHandler(`No analysis found containing name: ${cmdScriptName}`);
      }

      if (!options.silent) {
        scriptList = await confirmAnalysisFromConfig([analysisFound]);
      }
    }
  }

  if (scriptList.length === 0) {
    errorHandler(`Cancelled`);
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });
  for (const { id, fileName, path } of scriptList) {
    let { runtime: runtimeParam } = await account.analysis.info(id);
    let runtime;
    if (options.deno && options.node) {
      errorHandler("Cannot specify both --deno and --node flags");
    } else if (options.deno) {
      infoMSG("Deploying with deno runtime");
      runtime = "--deno";
    } else if (options.node) {
      infoMSG("Deploying with node runtime");
      runtime = "--node";
    } else {
      runtime = detectRuntime(runtimeParam || "");
    }

    await buildScript({
      account,
      scriptName: fileName,
      analysisID: id,
      config,
      runtime,
      path: path || "",
      projectRoot: scope.root,
    });
  }
  process.exit();
}

export { deployAnalysis };
