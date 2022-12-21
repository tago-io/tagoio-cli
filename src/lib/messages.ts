import color from "colors-cli/safe";

function questionMSG(str: any) {
  return `[${color.magenta("PROMPT")}] ${str}`;
}

function errorHandler(str: any) {
  return console.error(`[${color.red("ERROR")}] ${color.x221(str)}`);
}

function highlightMSG(str: any) {
  return color.cyan(str);
}

function successMSG(str: any) {
  return console.info(`[${color.green("INFO")}] ${str}`);
}

function infoMSG(str: any) {
  return console.info(`[${color.blue("INFO")}] ${str}`);
}

export { errorHandler, questionMSG, highlightMSG, successMSG, infoMSG };
