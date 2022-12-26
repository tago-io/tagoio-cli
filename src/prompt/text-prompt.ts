import prompts from "prompts";

async function promptTextToEnter(message: string = "Enter a name/message: ", initial?: string) {
  const { response } = await prompts({ message, type: "text", name: "response", initial });

  return response as string;
}

export { promptTextToEnter };
