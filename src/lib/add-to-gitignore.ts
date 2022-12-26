import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";

function addOnGitIgnore(folder: string, fileName: string) {
  const gitignorePath = `${folder}/.gitignore`;

  try {
    const gitIgnoreFile = readFileSync(gitignorePath, { encoding: "utf-8" });
    if (gitIgnoreFile.includes(fileName)) {
      return;
    }
  } catch {
    //any
  }

  try {
    if (existsSync(gitignorePath)) {
      appendFileSync(gitignorePath, `${fileName}\n`, { encoding: "utf-8" });
    } else {
      writeFileSync(gitignorePath, `${fileName}\n`, { encoding: "utf-8" });
    }
  } catch (error) {
    console.error(error);
    return;
  }
}

export { addOnGitIgnore };
