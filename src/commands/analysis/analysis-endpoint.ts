import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

const ENDPOINT_ACCESS = ["public", "token"] as const;

interface EndpointOptions {
  enableEndpoint?: boolean;
  disableEndpoint?: boolean;
  endpointAccess?: string;
  json?: boolean;
}

/**
 * The `endpoint` field the API returns on every analysis, as `{ active, access }`.
 * Not in the SDK's analysis types as of 12.3.6, so call sites cast past them.
 */
interface AnalysisEndpoint {
  active?: boolean;
  access?: (typeof ENDPOINT_ACCESS)[number];
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Builds the `endpoint` field from `--enable-endpoint`,
 * `--disable-endpoint` and `--endpoint-access`.
 *
 * Returns `undefined` when no endpoint flag was given, so the caller omits the
 * key and leaves the current Endpoint settings alone.
 */
function parseAnalysisEndpoint(options: EndpointOptions): AnalysisEndpoint | undefined {
  if (options.enableEndpoint && options.disableEndpoint) {
    failWith("--enable-endpoint and --disable-endpoint cannot be used together.", "conflicting_flags", options.json);
  }

  const access = options.endpointAccess;
  // `!== undefined` so an empty value, such as an unset shell variable, fails
  // instead of silently leaving the access mode alone.
  if (access !== undefined && !ENDPOINT_ACCESS.includes(access as (typeof ENDPOINT_ACCESS)[number])) {
    failWith(`Invalid --endpoint-access "${access}". Use one of: ${ENDPOINT_ACCESS.join(", ")}.`, "invalid_endpoint_access", options.json);
  }

  const endpoint: AnalysisEndpoint = {};
  if (options.enableEndpoint || options.disableEndpoint) {
    endpoint.active = Boolean(options.enableEndpoint);
  }
  if (access) {
    endpoint.access = access as (typeof ENDPOINT_ACCESS)[number];
  }

  return Object.keys(endpoint).length ? endpoint : undefined;
}

/** Human view of the Endpoint, such as `on (public)` or `off (token)`. */
function formatEndpoint(endpoint: AnalysisEndpoint | undefined) {
  if (!endpoint) {
    return undefined;
  }
  const state = endpoint.active ? "on" : "off";
  return endpoint.access ? `${state} (${endpoint.access})` : state;
}

export { formatEndpoint, parseAnalysisEndpoint };
export type { AnalysisEndpoint, EndpointOptions };
