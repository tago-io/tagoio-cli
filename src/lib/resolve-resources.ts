import { Resources } from "@tago-io/sdk";
import type { GenericModuleParams } from "@tago-io/sdk";

import { getEnvironmentConfig } from "./config-file.js";
import { errorHandler } from "./messages.js";

interface ResolveResourcesOptions {
  environment?: string;
  /** Profile token for this invocation, bypassing the lock file (CI/CD). */
  token?: string;
}

interface ResolvedResources {
  resources: Resources;
  /** The resolved region, for callers that build URLs (e.g. download). */
  region: GenericModuleParams["region"];
}

/**
 * Builds a Resources client from the resolved environment config, applying a
 * `--token` override. Errors if the environment or token is missing. Returns
 * the region too, for callers that need to build file URLs. Shared by the
 * files-* commands.
 */
function resolveResources(options: ResolveResourcesOptions): ResolvedResources {
  const config = getEnvironmentConfig(options.environment);
  if (!config) {
    errorHandler("Environment not found");
  }
  if (options.token) {
    config.profileToken = options.token;
  }
  if (!config.profileToken) {
    errorHandler("No profile token found. Pass --token or run 'tagoio login'.");
  }
  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });
  return { resources, region: config.profileRegion };
}

export { resolveResources };
export type { ResolveResourcesOptions, ResolvedResources };
