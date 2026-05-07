import { stringify } from "envfile";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { addOnGitIgnore } from "./add-to-gitignore.js";
import { resolveScope } from "./resolve-scope.js";

interface IEnvFile {
  TAGOIO_DEFAULT?: string;
  [key: string]: string | undefined;
}

/**
 * @description Returns the resolved-scope path for `personal.env`. Computed at
 * call time (not module load) so the resolver always reflects the current cwd
 * — important for tests that change cwd, and for any future caller that
 * resolves a scope explicitly.
 */
function getEnvFilePath(): string {
  return resolveScope().envFilePath;
}

function ensureDirectoryExistence(filePath: string) {
  const directoryName = dirname(filePath);
  if (existsSync(directoryName)) {
    return true;
  }
  ensureDirectoryExistence(directoryName);
  mkdirSync(directoryName);
}

function setEnvironmentVariables(params: IEnvFile) {
  params = {
    TAGOIO_DEFAULT: params.TAGOIO_DEFAULT || process.env.TAGOIO_DEFAULT,
  };

  const scope = resolveScope();
  const envFilePath = scope.envFilePath;

  if (scope.scope === "global") {
    // S1: keep the env file unreadable by other local users.
    mkdirSync(dirname(envFilePath), { recursive: true, mode: 0o700 });
    writeFileSync(envFilePath, stringify(params), { mode: 0o600 });
    return;
  }

  ensureDirectoryExistence(envFilePath);
  writeFileSync(envFilePath, stringify(params));
  addOnGitIgnore(scope.root, `.tagoio`);
}

export { setEnvironmentVariables, ensureDirectoryExistence, getEnvFilePath };
