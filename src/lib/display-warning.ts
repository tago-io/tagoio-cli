import kleur from "kleur";

interface WarningMessage {
  text: string;
  bold?: boolean;
}

/** Displays a styled warning box with customizable messages. Emits to stderr so
 * warnings don't contaminate stdout when commands are piped. */
function displayWarning(messages: WarningMessage[]): void {
  const maxLength = Math.max(...messages.map((m) => m.text.length), 60);
  const writeLine = (line: string) => process.stderr.write(`${line}\n`);

  writeLine("");
  writeLine(kleur.bgYellow().black().bold(" WARNING "));
  writeLine(kleur.yellow("═".repeat(maxLength)));

  for (const message of messages) {
    if (message.bold) {
      writeLine(kleur.yellow().bold(message.text));
    } else {
      writeLine(kleur.yellow(message.text));
    }
  }

  writeLine(kleur.yellow("═".repeat(maxLength)));
  writeLine("");
}

export { displayWarning };
export type { WarningMessage };
