import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Interactive autocomplete picker that lists actions from the
 * caller's profile and resolves to the chosen action's id. Mirrors
 * `pickEntityIDFromTagoIO` so the action commands have the same prompt UX as
 * the device and entity commands.
 *
 * The 200 amount is the Scale plan's ceiling for Actions per TagoIO's resource
 * limits (Free 5 / Starter 100 / Scale 200), so the list can never be silently
 * truncated on any plan.
 */
async function pickActionIDFromTagoIO(resources: Resources, message: string = "Which action you want to choose?") {
  const actionList = await resources.actions.list({ amount: 200, fields: ["id", "name"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: actionList.map((x) => ({ title: x.name, value: x.id })),
  });

  if (!id) {
    errorHandler("Action not selected");
  }

  return id as string;
}

export { pickActionIDFromTagoIO };
