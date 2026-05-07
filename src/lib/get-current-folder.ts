import { cwd } from "node:process";

function getCurrentFolder() {
  return cwd();
}

export { getCurrentFolder };
