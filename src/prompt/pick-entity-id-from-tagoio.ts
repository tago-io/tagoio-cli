import { Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Interactive autocomplete picker that lists entities from the
 * caller's profile and resolves to the chosen entity's id. Mirrors
 * `pickDeviceIDFromTagoIO` so the entity commands have the same prompt UX as
 * the device commands.
 *
 * Entities live on the SDK's `Resources` class, not on `Account`, so this
 * helper expects an instantiated `Resources` rather than an `Account`.
 */
async function pickEntityIDFromTagoIO(resources: Resources, message: string = "Which entity you want to choose?") {
  const entityList = await resources.entities.list({ amount: 100, fields: ["id", "name"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: entityList.map((x) => ({ title: x.name, value: x.id })),
  });

  if (!id) {
    errorHandler("Entity not selected");
  }

  return id as string;
}

export { pickEntityIDFromTagoIO };
