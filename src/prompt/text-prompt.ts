import prompts from "prompts";

/**
 * Prompts the user to enter a text value.
 * @param message The message to display to the user.
 * @param initial The initial value to display in the prompt.
 * @returns A Promise that resolves to the user's entered text value.
 */
async function promptTextToEnter(message: string = "Enter a name/message: ", initial?: string) {
  const { response } = await prompts({ message, type: "text", name: "response", initial });

  return response as string;
}

export { promptTextToEnter };
