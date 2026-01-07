import { Account } from "@tago-io/sdk";
import kleur from "kleur";
import { join } from "path";
import prompts from "prompts";

import { errorHandler } from "../lib/messages";

/**
 * Prompts the user to select a file from their TagoIO account.
 * @param account - The TagoIO account object.
 * @param message - The message to display to the user.
 * @param currentPath - The current path to display to the user.
 * @returns The URL of the selected file, or undefined if the user cancels.
 */

async function pickFileFromTagoIO(account: Account, message: string = "Pick the file", currentPath: string = "deviceBackup/"): Promise<string | undefined> {
  let file = { isFolder: true, name: "" };

  while (file.isFolder) {
    // Get a list of files and folders in the current path
    const path = currentPath === "./" ? "" : currentPath;
    const fileList = await account.files.list({ path, quantity: 100 });

    // If there are no files or folders, cancel the operation
    if (!fileList) {
      errorHandler("Cancelled");
      return;
    }

    // Create a list of choices for the user to select from
    const folders = fileList.folders.map((x) => ({ title: kleur.italic(`${x}/`), value: { name: x, isFolder: true } }));
    const files = fileList.files
      .filter((x) => x.filename.includes("json"))
      .map((x) => ({ title: x.filename.split("/").pop() as string, value: { name: x.filename, isFolder: false } }));
    const choices = [...folders, ...files];

    // If the current path is not the root path, add an option to go up one level
    if (currentPath !== "" && currentPath !== "./") {
      choices.push({ title: kleur.italic("../"), value: { name: "../", isFolder: true } });
    }

    // Add an option to cancel the operation
    choices.push({ title: kleur.red("Cancel"), value: { name: "", isFolder: false } });

    // Prompt the user to select a file or folder
    ({ file } = await prompts({
      message: `${message} (${kleur.cyan(currentPath)}):`,
      name: "file",
      type: "autocomplete",
      choices,
    }));

    // If the user cancels, stop the operation
    if (!file) {
      errorHandler("Cancelled");
      return;
    }

    // If the user selected a folder, update the current path and repeat the loop
    if (file.isFolder) {
      currentPath = join(currentPath, file.name, "/");
    }
  }

  // If the user selected a file, return its URL
  if (!file.name) {
    return;
  }
  const profile = await account.profiles.info("current");
  return `https://api.tago.io/file/${profile.info.id}/${file.name}`;
}

export { pickFileFromTagoIO };
