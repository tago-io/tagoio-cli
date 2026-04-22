import kleur from "kleur";

function errorHandler(str: any): never {
  console.error(`[${kleur.red("ERROR")}] ${kleur.bold(str)}`);
  process.exit(1);
}

function highlightMSG(str: any) {
  return kleur.cyan(str);
}

function successMSG(str: any) {
  return console.info(`[${kleur.green("OK")}] ${str}`);
}

function infoMSG(str: any) {
  return console.info(`[${kleur.blue("INFO")}] ${str}`);
}

export { errorHandler, highlightMSG, successMSG, infoMSG };
