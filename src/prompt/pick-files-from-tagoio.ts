import { join } from "path";
import { Account } from "@tago-io/sdk";
import prompts from "prompts";
import kleur from "kleur";
import { errorHandler } from "../lib/messages";

async function pickFileFromTagoIO(account: Account, message: string = "Pick the file", currentPath: string = "deviceBackup/"): Promise<string | undefined> {
  let file = { isFolder: true, name: "" };

  while (file.isFolder) {
    const path = currentPath === "./" ? "" : currentPath;
    const fileList = await account.files.list({ path, quantity: 100 });
    if (!fileList) {
      errorHandler("Cancelled");
      process.exit(0);
    }

    const folders = fileList.folders.map((x) => ({ title: kleur.italic(`${x}/`), value: { name: x, isFolder: true } }));
    const files = fileList.files
      .filter((x) => x.filename.includes("json"))
      .map((x) => ({ title: x.filename.split("/").pop() as string, value: { name: x.filename, isFolder: false } }));

    const choices = [...folders, ...files];
    if (currentPath !== "" && currentPath !== "./") {
      choices.push({ title: kleur.italic("../"), value: { name: "../", isFolder: true } });
    }

    choices.push({ title: kleur.red("Cancel"), value: { name: "", isFolder: false } });

    ({ file } = await prompts({
      message: `${message} (${kleur.cyan(currentPath)}):`,
      name: "file",
      type: "autocomplete",
      choices,
    }));

    if (!file) {
      errorHandler("Cancelled");
      process.exit(0);
    }

    if (file.isFolder) {
      currentPath = join(currentPath, file.name, "/");
    }
  }

  if (!file.name) {
    return;
  }

  const profile = await account.profiles.info("current");
  return `https://api.tago.io/file/${profile.info.id}/${file.name}`;
}
export { pickFileFromTagoIO };
