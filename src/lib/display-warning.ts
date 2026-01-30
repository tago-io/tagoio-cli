import kleur from "kleur";

interface WarningMessage {
  text: string;
  bold?: boolean;
}

/** Displays a styled warning box with customizable messages. */
function displayWarning(messages: WarningMessage[]): void {
  const maxLength = Math.max(...messages.map((m) => m.text.length), 60);

  console.info("");
  console.info(kleur.bgYellow().black().bold(" WARNING "));
  console.info(kleur.yellow("═".repeat(maxLength)));

  for (const message of messages) {
    if (message.bold) {
      console.info(kleur.yellow().bold(message.text));
    } else {
      console.info(kleur.yellow(message.text));
    }
  }

  console.info(kleur.yellow("═".repeat(maxLength)));
  console.info("");
}

export { displayWarning };
export type { WarningMessage };
