import { cwd } from "process";

function getCurrentFolder() {
  return cwd();
}

export { getCurrentFolder };
