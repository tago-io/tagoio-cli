import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { stringify } from "envfile";
import { getCurrentFolder } from "./get-current-folder";
import { addOnGitIgnore } from "./add-to-gitignore";

interface IEnvFile {
  TAGOIO_DEFAULT?: string;
  [key: string]: string | undefined;
}

const ENV_FILE_PATH = `${getCurrentFolder()}/.tagoio/personal.env`;

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

  const folder = getCurrentFolder();

  ensureDirectoryExistence(ENV_FILE_PATH);
  writeFileSync(ENV_FILE_PATH, stringify(params));
  addOnGitIgnore(folder, `.tagoio`);
}

export { setEnvironmentVariables, ENV_FILE_PATH };
