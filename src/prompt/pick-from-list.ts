import prompts from "prompts";

interface IPromptOption {
  message?: string;
  initial?: string;
}

/**
 * Prompts the user to pick an option from a list.
 * @param list The list of options to choose from.
 * @param message The message to display to the user.
 * @param initial The initial value to display in the prompt.
 * @returns The value of the selected option.
 */
async function pickFromList<L extends { value?: any; title: string }[]>(list: L, { message = "Pick One", initial }: IPromptOption) {
  const { response } = await prompts({
    message,
    name: "response",
    type: "autocomplete",
    initial,
    choices: list,
  });

  return response as L[number]["value"] extends void ? L[number]["title"] : L[number]["title"];
}

export { pickFromList };
