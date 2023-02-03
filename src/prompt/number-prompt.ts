import prompts from "prompts";

interface NumberOptions {
  min?: number;
  max?: number;
  initial?: number;
}

async function promptNumber(message: string = "Enter a number: ", options: NumberOptions = {}) {
  const { response } = await prompts({ message, type: "number", name: "response", ...options });

  return response as number;
}

export { promptNumber };
