import kleur from "kleur";

function questionMSG(str: any) {
  return `[${kleur.magenta("PROMPT")}] ${str}`;
}

function errorHandler(str: any) {
  console.error(`[${kleur.red("ERROR")}] ${kleur.bold(str)}`);
  process.exit(0);
}

function highlightMSG(str: any) {
  return kleur.cyan(str);
}

function successMSG(str: any) {
  return console.info(`[${kleur.green("INFO")}] ${str}`);
}

function infoMSG(str: any) {
  return console.info(`[${kleur.blue("INFO")}] ${str}`);
}

export { errorHandler, questionMSG, highlightMSG, successMSG, infoMSG };
