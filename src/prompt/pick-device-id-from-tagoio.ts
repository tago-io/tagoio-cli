import { Account, Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

// Accepts either SDK client: the legacy device commands pass `Account`, while
// the newer `Resources`-based commands pass `Resources`. Both expose
// `devices.list`, which is all this picker needs.
async function pickDeviceIDFromTagoIO(account: Resources | Account, message: string = "Which device you want to choose?") {
  const deviceList = await account.devices.list({ amount: 100, fields: ["id", "name"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: deviceList.map((x) => ({ title: x.name, value: x.id })),
  });

  if (!id) {
    errorHandler("Device not selected");
  }

  return id as string;
}

export { pickDeviceIDFromTagoIO };
