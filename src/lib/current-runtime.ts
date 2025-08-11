import { existsSync, readFileSync } from "node:fs";

function detectRuntime() {
  if (existsSync(`./deno.json`) ||
      existsSync(`./deno.jsonc`) ||
      existsSync(`./deno.lock`)) {
    return '--deno';
  }

  return '--node';
}


export { detectRuntime };