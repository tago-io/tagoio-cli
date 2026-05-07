import { existsSync, lstatSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { errorHandler } from "./messages.js";

const CONFIG_FILE_NAME = "tagoconfig.json";
const MAX_WALK_DEPTH = 32;

interface ResolvedScope {
  scope: "local" | "global";
  root: string;
  configPath: string;
  envFilePath: string;
  configExists: boolean;
}

let scopeOverride: "global" | undefined;

/**
 * @description Forces every subsequent `resolveScope()` call in this process
 * to return the global scope, bypassing the parent-walk. Used by command
 * handlers when `--global` is passed so writes target the global config dir
 * regardless of cwd.
 *
 * Pass `undefined` to clear the override (rarely needed in a single-shot CLI).
 */
function setScopeOverride(forced: "global" | undefined): void {
  scopeOverride = forced;
}

/**
 * @description Returns the absolute path of the directory where the global
 * `tagoconfig.json` lives. XDG Base Directory Specification on Unix; standard
 * Roaming AppData location on Windows.
 */
function globalConfigDir(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "tagoio");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(xdg, "tagoio");
}

function buildScope(scope: "local" | "global", root: string, configExists: boolean): ResolvedScope {
  return {
    scope,
    root,
    configPath: path.join(root, CONFIG_FILE_NAME),
    envFilePath: path.join(root, ".tagoio", "personal.env"),
    configExists,
  };
}

/**
 * @description Resolves the active scope for the current invocation.
 *
 * Walks from `startDir` (default `process.cwd()`) up the logical parent chain
 * (no `realpath` resolution; matches `git`/`npm` convention), capped at 32
 * levels. The first ancestor containing `tagoconfig.json` becomes the local
 * scope root. If no ancestor matches, falls back to the platform-specific
 * global config directory.
 *
 * The walk is logical-only and depth-capped so behavior stays predictable on
 * NFS / encrypted home directories.
 */
function resolveGlobal(): ResolvedScope {
  const globalRoot = globalConfigDir();
  // S2: refuse to operate if the global directory is a symlink.
  if (existsSync(globalRoot) && lstatSync(globalRoot).isSymbolicLink()) {
    errorHandler(`${globalRoot} is a symlink; refusing to read/write credentials. Remove or replace it.`);
  }
  const configExists = existsSync(path.join(globalRoot, CONFIG_FILE_NAME));
  return buildScope("global", globalRoot, configExists);
}

function resolveScope(opts?: { startDir?: string }): ResolvedScope {
  if (scopeOverride === "global") {
    return resolveGlobal();
  }

  const start = opts?.startDir ?? process.cwd();

  let current = path.resolve(start);
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (existsSync(path.join(current, CONFIG_FILE_NAME))) {
      return buildScope("local", current, true);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return resolveGlobal();
}

/**
 * @description Throws an actionable error if the resolved scope is global.
 * Used by analysis-* command handlers as their first action — analysis
 * development requires a project directory because the analysis source files
 * live there.
 */
function requireLocalScope(commandName: string): ResolvedScope {
  const scope = resolveScope();
  if (scope.scope !== "local") {
    errorHandler(`'${commandName}' requires a project directory with tagoconfig.json. cd into a project root or run \`tagoio init\` here.`);
  }
  return scope;
}

export { resolveScope, globalConfigDir, requireLocalScope, setScopeOverride, ResolvedScope };
