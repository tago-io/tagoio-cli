import appRootPath from "app-root-path";

function getCurrentFolder() {
  return appRootPath.toString();
}

export { getCurrentFolder };
