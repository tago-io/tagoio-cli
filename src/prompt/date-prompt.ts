import prompts from "prompts";

async function datePrompt(message: string = "Pick a date (UTC): ", mask: string = "YYYY-MM-DD HH:mm", initialValue: Date = new Date()) {
  const { response } = await prompts({
    message,
    name: "response",
    mask,
    initial: initialValue,
    type: "date",
  });

  return response as Date;
}

export { datePrompt };
