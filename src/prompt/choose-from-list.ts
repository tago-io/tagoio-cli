import prompts, { Choice } from "prompts";

async function chooseFromList<L extends Choice[]>(list: L, message: string = "Choose the ones from the list: ") {
  const { response } = await prompts({
    message,
    name: "response",
    type: "autocompleteMultiselect",
    choices: list,
  });

  return response as L[number]["value"][];
}

export { chooseFromList };
