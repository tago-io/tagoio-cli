import prompts from "prompts";

interface IPromptOption {
  message?: string;
  initial?: string;
}

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
