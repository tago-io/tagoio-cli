import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { resolveScope, ResolvedScope } from "./resolve-scope.js";

interface InitState {
  scope: ResolvedScope;
  /** True when stdin is an interactive terminal. Used by Step 2 to decide prompt vs flag-required. */
  isTTY: boolean;
  /** tagoconfig.json on disk at the resolved scope. */
  configExists: boolean;
  /** Env block already present in the resolved config. */
  envExists: boolean;
  /** Per-env lock file (.tago-lock.<envName>.lock) on disk. */
  tokenExists: boolean;
}

/**
 * @description Pre-flight detection (Step 0 of the clig.dev init flow).
 *
 * Reads the resolved scope and the on-disk state for the requested env name
 * so later steps can branch deterministically. No prompts, no API calls; a
 * handful of `existsSync` checks so it stays under 100ms even on slow disks.
 */
function detectInitState(envName: string): InitState {
  const scope = resolveScope();
  const configExists = scope.configExists;

  let envExists = false;
  if (configExists) {
    // Malformed config → envExists stays false, the safe default for init.
    try {
      const raw = readFileSync(scope.configPath, "utf8");
      const parsed = JSON.parse(raw);
      envExists = typeof parsed === "object" && parsed !== null && envName in parsed && typeof parsed[envName] === "object";
    } catch {
      envExists = false;
    }
  }

  const tokenExists = existsSync(path.join(scope.root, `.tago-lock.${envName}.lock`));
  const isTTY = Boolean(process.stdin.isTTY);

  return { scope, isTTY, configExists, envExists, tokenExists };
}

export { detectInitState, InitState };
