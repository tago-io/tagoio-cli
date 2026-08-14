import { type DictionaryInfo, Resources } from "@tago-io/sdk";
import prompts from "prompts";

import { errorHandler } from "../lib/messages.js";

/**
 * @description Builds the autocomplete choices. Exported so the labelling is
 * testable without driving the prompt: the module calls `prompts(...)` as a
 * function, which a spy on `prompts.prompt` never intercepts.
 *
 * The slug is appended because a dictionary carries both a name and a slug, and
 * the slug is the meaningful secondary identifier — it is what
 * `languageInfoBySlug` takes. It is omitted when absent so the label never
 * renders an empty bracket.
 */
function toDictionaryChoices(list: DictionaryInfo[]) {
  return list.map((x) => ({ title: x.slug ? `${x.name} [${x.slug}]` : x.name, value: x.id }));
}

/**
 * @description Interactive autocomplete picker that lists dictionaries from the
 * caller's profile and resolves to the chosen dictionary's id. Mirrors
 * `pickEntityIDFromTagoIO` so the dict-* commands share the prompt UX of the
 * device, entity and action families.
 *
 * Each choice is labelled `name [slug]`. A dictionary carries both, and the
 * slug is the meaningful secondary identifier — it is what `languageInfoBySlug`
 * takes — so it reads better than the opaque id.
 */
async function pickDictionaryIDFromTagoIO(resources: Resources, message: string = "Which dictionary you want to choose?") {
  const dictionaryList = await resources.dictionaries.list({ amount: 100, fields: ["id", "name", "slug"] });

  const { id } = await prompts({
    message,
    name: "id",
    type: "autocomplete",
    choices: toDictionaryChoices(dictionaryList),
  });

  if (!id) {
    errorHandler("Dictionary not selected");
  }

  return id as string;
}

export { pickDictionaryIDFromTagoIO, toDictionaryChoices };
