import { Resources, type UserInfo } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Builds the autocomplete choices. Exported so the labelling is
 * testable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * The label carries both name and email because a portal has duplicate display
 * names far more often than duplicate emails — and the email is what the API
 * itself treats as the user's identity. A user with no name falls back to the
 * email alone, since nothing in `UserInfo` guarantees `name` is set.
 */
function toRunUserChoices(list: UserInfo[]) {
  return list.map((x) => ({ title: x.name ? `${x.name} <${x.email}>` : x.email, value: x.id }));
}

/**
 * @description Interactive autocomplete picker that lists the profile's TagoRUN
 * users and resolves to the chosen user's id. Mirrors `pickSecretIDFromTagoIO`
 * so the run-user-* commands share the prompt UX of the other families.
 */
async function pickRunUserIDFromTagoIO(resources: Resources, message: string = "Which run user you want to choose?") {
  const userList = await resources.run.listUsers({ amount: 10000, fields: ["id", "name", "email"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: toRunUserChoices(userList as UserInfo[]),
  });

  if (!id) {
    errorHandler("Run user not selected");
  }

  return id as string;
}

export { pickRunUserIDFromTagoIO, toRunUserChoices };
