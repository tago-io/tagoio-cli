/* IMPORT */

import kleur from "kleur";
import { compare } from "./compare.js";

const updaterUtils = {
  /* API */

  fetch: async (url: string): Promise<{ version?: string }> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json() as Promise<{ version?: string }>;
  },

  getLatestVersion: async (name: string): Promise<string | undefined> => {
    const latestUrl = `http://registry.npmjs.org/${name}/latest`;
    const latest = await updaterUtils.fetch(latestUrl);
    return latest.version;
  },

  isUpdateAvailable: (current: string, latest: string): boolean => {
    return compare(current, latest) === -1;
  },

  notify: (name: string, version: string, latest: string) => {
    return () => console.log(`\n\n📦 Update available for ${kleur.cyan(name)}: ${kleur.gray(version)} → ${kleur.green(latest)}`);
  },
};

const updater = async ({ name, version }: { name: string; version: string }) => {
  const latest = await updaterUtils.getLatestVersion(name).catch(() => undefined);
  const log = () => null;

  if (!latest) {
    return log;
  }

  if (!updaterUtils.isUpdateAvailable(version, latest)) {
    return log;
  }

  return updaterUtils.notify(name, version, latest);
};

/* EXPORT */

export { updaterUtils, updater };
