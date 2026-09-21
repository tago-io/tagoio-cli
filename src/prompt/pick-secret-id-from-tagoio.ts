import { Resources, type SecretsInfo } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Builds the autocomplete choices. Exported so the labelling is
 * testable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * A secret has no name, so the key is the whole label. Nothing else from the
 * record is rendered — not even `value_length`, which would hint at the size of
 * a credential in a list anyone can see.
 */
function toSecretChoices(list: SecretsInfo[]) {
  return list.map((x) => ({ title: x.key, value: x.id }));
}

/**
 * @description Interactive autocomplete picker that lists secrets from the
 * caller's profile and resolves to the chosen secret's id. Mirrors
 * `pickDictionaryIDFromTagoIO` so the secret-* commands share the prompt UX of
 * the other families.
 */
async function pickSecretIDFromTagoIO(resources: Resources, message: string = "Which secret you want to choose?") {
  const secretList = await resources.secrets.list({ amount: 100, fields: ["id", "key"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: toSecretChoices(secretList),
  });

  if (!id) {
    errorHandler("Secret not selected");
  }

  return id as string;
}

export { pickSecretIDFromTagoIO, toSecretChoices };
