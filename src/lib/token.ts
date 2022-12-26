import { randomBytes } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { addOnGitIgnore } from "./add-to-gitignore";
import { getCurrentFolder } from "./get-current-folder";

function readToken(environment: string) {
  const folder = getCurrentFolder();

  try {
    const tokenFile = readFileSync(`${folder}/.tago-lock.${environment}.lock`, { encoding: "utf-8" });
    const tokenDirty = tokenFile.split("\n");
    const token = Buffer.from(tokenDirty[tokenDirty.length - 1], "hex").toString();

    return token;
  } catch {
    return undefined;
  }
}

function writeToken(token: string, environment: string) {
  const folder = getCurrentFolder();
  if (!folder) {
    return;
  }

  let dirtyText = "";
  for (let index = 0; index < 500; index++) {
    // ? Prevent show token on share screen by mistake
    dirtyText += `${randomBytes(36).toString("hex")}\n`;
  }

  const tokenFile = dirtyText + Buffer.from(token).toString("hex");

  writeFileSync(`${folder}/.tago-lock.${environment}.lock`, tokenFile, { encoding: "utf-8" });
  addOnGitIgnore(folder, `.tago-lock.${environment}.lock`);
}

export { readToken, writeToken };
