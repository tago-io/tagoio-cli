import { ChildProcess, SpawnOptions, spawn } from "node:child_process";
import path from "node:path";

import { Account } from "@tago-io/sdk";

import { getEnvironmentConfig, IEnvironment, resolveCLIPath } from "../../lib/config-file.js";
import { detectRuntime } from "../../lib/current-runtime.js";
import { errorHandler, highlightMSG, infoMSG, successMSG } from "../../lib/messages.js";
import { requireLocalScope } from "../../lib/resolve-scope.js";
import { searchName } from "../../lib/search-name.js";
import { installWatchShortcuts } from "../../lib/watch-shortcuts.js";
import { pickAnalysisFromConfig } from "../../prompt/pick-analysis-from-config.js";

/**
 * Builds the command to run the analysis.
 * @param options - The options to configure the command.
 * @param options.tsnd - Whether to use `tsnd` to run the command.
 * @param options.debug - Whether to enable debugging for the command.
 * @param options.clear - Whether to clear the console before running the command.
 * @param options.runtime - The runtime to use ('deno' or 'node').
 * @returns The built command as a string.
 */
function _buildCMD(options: { tsnd: boolean; debug: boolean; clear: boolean }, runtimeParam: string): string {
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
        // tsx wraps node with a CJS/ESM-aware TypeScript loader. Needed
        // because Node's native --experimental-transform-types forces ESM
        // resolution, which breaks legacy analyses that import CJS
        // subpaths without a `.js` extension (e.g. "@tago-io/sdk/lib/types").
        cmd = `node ${resolveCLIPath("/node_modules/tsx/dist/cli.mjs")} watch `;
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

interface RunAnalysisOptions {
  environment: string;
  debug: boolean;
  clear: boolean;
  tsnd: boolean;
  deno: boolean;
  node: boolean;
  /**
   * Commander negation flag (`--no-interactive`). Defaults to `true`. When
   * `false`, the watch-mode keystroke shortcuts are not installed and the
   * command runs exactly as it did before this feature shipped.
   */
  interactive?: boolean;
}

/**
 * Runs an analysis script.
 * @param scriptName - The name of the script to run.
 * @param options - The options for running the script.
 * @returns void
 */
async function runAnalysis(scriptName: string | undefined, options: RunAnalysisOptions) {
  // Analysis development requires a project directory.
  const scope = requireLocalScope("analysis-run");

  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    errorHandler("Environment not found");
  }

  const analysisList = (config.analysisList ?? []).filter((x) => x.fileName);
  let scriptToRun: NonNullable<IEnvironment["analysisList"]>[number];
  if (scriptName) {
    scriptName = scriptName.toLowerCase();
    scriptToRun = searchName(
      scriptName,
      analysisList.map((x) => ({ names: [x.name, x.fileName], value: x })),
    );
  } else {
    scriptToRun = await pickAnalysisFromConfig(analysisList);
  }

  if (!scriptToRun || !scriptToRun.id) {
    errorHandler(`Analysis couldn't be found: ${scriptName}`);
  }

  const account = new Account({ token: config.profileToken, region: config.profileRegion });

  let { token: analysisToken, run_on, name, runtime: runtimeParam } = await account.analysis.info(scriptToRun.id);
  const tokenSuffix = analysisToken ? ` [${highlightMSG(analysisToken)}]` : "";
  successMSG(`> Analysis found: ${highlightMSG(scriptToRun.fileName)} (${name})${tokenSuffix}.`);

  const analysisEnv: { [key: string]: string } = {
    ...process.env,
    T_EXTERNAL: "external",
    T_ANALYSIS_TOKEN: analysisToken,
    T_ANALYSIS_ID: scriptToRun.id,
  };

  if (typeof config.profileRegion === "object") {
    analysisEnv.TAGOIO_API = config.profileRegion.api;
    if (config.profileRegion.sse) {
      analysisEnv.TAGOIO_SSE = config.profileRegion.sse;
    }
  }

  // Interactive shortcuts (q/h/r/c + double-Ctrl-C) are only installed when
  // stdin is a TTY and the caller did not pass `--no-interactive`. Outside a
  // TTY (CI, piped stdin, Docker), the loop still works — it just won't
  // respawn, because no keystroke handler ever flips `restartRequested`.
  const isInteractive = Boolean(process.stdin.isTTY) && options.interactive !== false;

  // When shortcuts are on, the parent owns stdin exclusively so single keys
  // (q/h/r/c) route to our handler and never leak to tsx, which would interpret
  // them as its own watch-mode rerun triggers. Non-interactive mode keeps the
  // legacy "inherit" so an analysis that reads stdin still works under CI.
  const spawnOptions: SpawnOptions = {
    shell: true,
    cwd: scope.root,
    stdio: isInteractive ? ["ignore", "inherit", "inherit"] : "inherit",
    env: analysisEnv,
  };

  let scriptPath;
  if (scriptToRun.path) {
    scriptPath = path.join(config.analysisPath.concat("/", scriptToRun.path + "/"), scriptToRun.fileName).normalize();
  } else {
    scriptPath = path.join(config.analysisPath, scriptToRun.fileName).normalize();
  }

  let runtime;
  if (options.deno && options.node) {
    errorHandler("Cannot specify both --deno and --node flags");
  } else if (options.deno) {
    runtime = "--deno";
  } else if (options.node) {
    runtime = "--node";
  } else {
    runtime = detectRuntime(runtimeParam || "");
  }

  const cmd = _buildCMD(options, runtime);

  if (run_on === "tago") {
    await account.analysis.edit(scriptToRun.id, { run_on: "external" });
    await new Promise((resolve) => setTimeout(resolve, 200)); // sleep
    ({ token: analysisToken, run_on, name } = await account.analysis.info(scriptToRun.id));
    if (spawnOptions?.env) {
      spawnOptions.env.T_ANALYSIS_TOKEN = analysisToken;
    }
  }

  let restartRequested = false;
  let quitRequested = false;
  let child: ChildProcess | undefined;

  const teardown = installWatchShortcuts(
    {
      onQuit: () => {
        if (quitRequested) {
          return;
        }
        quitRequested = true;
        infoMSG("Stopping analysis...");
        child?.kill("SIGTERM");
      },
      onRestart: () => {
        if (restartRequested) {
          return;
        }
        restartRequested = true;
        infoMSG("Restarting analysis...");
        child?.kill("SIGTERM");
      },
    },
    { enabled: isInteractive },
  );

  try {
    do {
      restartRequested = false;
      // `exec` replaces the shell process with the analysis runtime so they
      // share a PID — without it, killing the child only kills `sh -c …` and
      // leaves the inner tsx/deno/tsnd process running as a zombie that keeps
      // printing to the terminal (looks like a phantom restart on every key).
      child = spawn(`exec ${cmd}"${scriptPath}"`, spawnOptions);
      if (isInteractive) {
        infoMSG("Watching for changes. Press h for help, r to restart, q to quit.");
      }
      await new Promise<void>((resolve) => child?.once("close", () => resolve()));
    } while (restartRequested && !quitRequested);
  } finally {
    teardown();
    await account.analysis.edit(scriptToRun.id, { run_on: "tago" });
  }
}
export { runAnalysis, _buildCMD };
