import { existsSync } from "node:fs";
import { getCurrentFolder } from "./get-current-folder";

function detectRuntime() {
  if (existsSync(`${getCurrentFolder}/deno.json`) ||
      existsSync(`${getCurrentFolder}/deno.jsonc`) ||
      existsSync(`${getCurrentFolder}/deno.lock`)) {
    return '--deno';
  }

  return '--node';
}

export { detectRuntime };