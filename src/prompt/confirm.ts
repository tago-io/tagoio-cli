import prompts from "prompts";

async function confirmPrompt(message: string = "Do you confirm?") {
  const { confirmation } = await prompts({
    message,
    name: "confirmation",
    type: "confirm",
  });

  return confirmation;
}

export { confirmPrompt };
