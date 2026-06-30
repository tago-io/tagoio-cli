import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { addOnGitIgnore } from "./add-to-gitignore.js";
import { resolveScope } from "./resolve-scope.js";

function lockFilePath(environment: string): string {
  const scope = resolveScope();
  return path.join(scope.root, `.tago-lock.${environment}.lock`);
}

function readToken(environment: string) {
  try {
    const tokenFile = readFileSync(lockFilePath(environment), { encoding: "utf-8" });
    const tokenDirty = tokenFile.split("\n");
    const token = Buffer.from(tokenDirty.at(-1) as string, "hex").toString();

    return token;
  } catch {
    return undefined;
  }
}

function writeToken(token: string, environment: string) {
  const scope = resolveScope();

  let dirtyText = "";
  for (let index = 0; index < 500; index++) {
    // ? Prevent show token on share screen by mistake
    dirtyText += `${randomBytes(36).toString("hex")}\n`;
  }

  const tokenFile = dirtyText + Buffer.from(token).toString("hex");
  const filePath = path.join(scope.root, `.tago-lock.${environment}.lock`);

  if (scope.scope === "global") {
    // S1: global lock files must be unreadable by other local users.
    mkdirSync(scope.root, { recursive: true, mode: 0o700 });
    writeFileSync(filePath, tokenFile, { encoding: "utf-8", mode: 0o600 });
    return;
  }

  writeFileSync(filePath, tokenFile, { encoding: "utf-8" });
  addOnGitIgnore(scope.root, `.tago-lock.${environment}.lock`);
}

export { readToken, writeToken };
