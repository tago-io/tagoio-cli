/**
 * The custom widget requests `@tago-io/sdk` does not wrap: the source upload,
 * which also runs the platform bundler, the signed URL for reading the stored
 * source back, and the list of a dashboard's widgets. Everywhere else the CLI
 * goes through the SDK.
 *
 * URLs are built only from the configured region and 24-character IDs, so no
 * caller-supplied URL or path reaches a request. Ported from the TagoIO MCP
 * server's custom-widget transport.
 */

const RESOURCE_ID_PATTERN = /^[0-9a-f]{24}$/;

/**
 * The platform bundles while the upload request is open, and a cold package
 * install can take a while. Probed: a small widget bundled in 3-5 s.
 */
const UPLOAD_TIMEOUT_MS = 120_000;
const READ_TIMEOUT_MS = 30_000;

/** The platform bundler refuses larger sources. */
const MAX_SOURCE_BYTES = 1024 * 1024;

interface TransportContext {
  apiURL: string;
  token: string;
}

/** Every bundle outcome, success or failure, arrives as HTTP 200 with this result. */
interface UploadOutcome {
  success: boolean;
  error: string | null;
  warnings: string[];
  artifactURL: string | null;
}

/** A widget as `listDashboardWidgets` returns it: only what a picker needs. */
interface DashboardWidget {
  id: string;
  label: string;
  type: string;
}

type UploadResponse =
  | { kind: "outcome"; outcome: UploadOutcome }
  /** The API refused the request (quota, authorization, unknown widget). */
  | { kind: "request_error"; message: string }
  /** The per-minute upload limit, which depends on the plan. */
  | { kind: "rate_limited"; retryAfterSeconds: number | null };

function assertResourceID(name: string, value: string): void {
  if (!RESOURCE_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${name} "${value}": expected a 24-character ID.`);
  }
}

function isEnvelope(value: unknown): value is { status: boolean; result?: unknown; message?: unknown } {
  return typeof value === "object" && value !== null && typeof (value as { status?: unknown }).status === "boolean";
}

function parseOutcome(result: unknown): UploadOutcome {
  const record = (typeof result === "object" && result !== null ? result : {}) as Record<string, unknown>;
  return {
    success: record.success === true,
    error: typeof record.error === "string" ? record.error : null,
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((warning): warning is string => typeof warning === "string") : [],
    artifactURL: typeof record.artifact_url === "string" ? record.artifact_url : null,
  };
}

/**
 * @description Uploads a widget's `.tsx` source. The platform stores it at
 * `widgets/<widget id>.tsx`, points the widget's `display.url` at it, and
 * bundles it. A bundle failure still saves the source, and the widget keeps
 * rendering its previous build; the outcome says which happened.
 */
async function uploadWidgetSource(context: TransportContext, params: { dashboardID: string; widgetID: string; source: string }): Promise<UploadResponse> {
  assertResourceID("dashboard ID", params.dashboardID);
  assertResourceID("widget ID", params.widgetID);

  const response = await fetch(`${context.apiURL}/dashboard/${params.dashboardID}/widget/${params.widgetID}/upload`, {
    method: "POST",
    headers: { "content-type": "application/json", token: context.token },
    // The API keys the file by widget ID; the name only fixes the extension.
    body: JSON.stringify({ file: Buffer.from(params.source, "utf8").toString("base64"), file_name: "widget.tsx" }),
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    redirect: "error",
  });

  if (response.status === 429) {
    const header = response.headers.get("retry-after");
    const seconds = header === null ? Number.NaN : Number(header);
    return { kind: "rate_limited", retryAfterSeconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : null };
  }

  const envelope: unknown = await response.json().catch(() => null);
  if (!isEnvelope(envelope)) {
    return { kind: "request_error", message: `the API returned an unrecognized response (HTTP ${response.status})` };
  }
  if (!envelope.status) {
    return { kind: "request_error", message: typeof envelope.message === "string" ? envelope.message : `HTTP ${response.status}` };
  }
  return { kind: "outcome", outcome: parseOutcome(envelope.result) };
}

/**
 * @description Reads a widget's stored source, or `null` when it has none yet.
 *
 * Goes through `/file/<profile>/widgets/<id>.tsx?noRedirect=true`, which
 * returns a short-lived signed URL and so bypasses the ~60 s Files CDN cache
 * that would otherwise serve the previous upload. The signed URL is a
 * credential: it never reaches a message.
 */
async function readWidgetSource(context: TransportContext, params: { profileID: string; widgetID: string }): Promise<string | null> {
  assertResourceID("profile ID", params.profileID);
  assertResourceID("widget ID", params.widgetID);

  const response = await fetch(`${context.apiURL}/file/${params.profileID}/widgets/${params.widgetID}.tsx?noRedirect=true`, {
    headers: { token: context.token },
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    redirect: "error",
  });
  if (response.status === 403 || response.status === 404) {
    return null;
  }

  const envelope: unknown = await response.json().catch(() => null);
  if (!isEnvelope(envelope) || !envelope.status || typeof envelope.result !== "string") {
    const message = isEnvelope(envelope) && typeof envelope.message === "string" ? envelope.message : `HTTP ${response.status}`;
    throw new Error(`Could not resolve the widget source: ${message}`);
  }

  // The signed URL points at storage, which must not receive the profile token.
  const file = await fetch(envelope.result, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  if (file.status === 403 || file.status === 404) {
    return null;
  }
  if (!file.ok) {
    throw new Error(`Could not download the widget source (HTTP ${file.status}).`);
  }
  return file.text();
}

/**
 * @description Lists every widget on a dashboard in one request, where the SDK
 * would need one `widgets.info` call per widget.
 *
 * Probed: `GET /dashboard/<id>/widgets` returns the full widget objects, each
 * with its own `token`. Only id, label and type leave this function, so that
 * token never reaches a caller, a message or a file.
 */
async function listDashboardWidgets(context: TransportContext, dashboardID: string): Promise<DashboardWidget[]> {
  assertResourceID("dashboard ID", dashboardID);

  const response = await fetch(`${context.apiURL}/dashboard/${dashboardID}/widgets`, {
    headers: { token: context.token },
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    redirect: "error",
  });
  if (response.status === 429) {
    throw new Error("Too many requests to the API; wait a minute and try again.");
  }

  const envelope: unknown = await response.json().catch(() => null);
  if (!isEnvelope(envelope) || !envelope.status || !Array.isArray(envelope.result)) {
    const message = isEnvelope(envelope) && typeof envelope.message === "string" ? envelope.message : `HTTP ${response.status}`;
    throw new Error(`Could not list the widgets of dashboard ${dashboardID}: ${message}`);
  }
  return envelope.result
    .filter((widget): widget is Record<string, unknown> => typeof widget === "object" && widget !== null && typeof widget.id === "string")
    .map((widget) => ({
      id: widget.id as string,
      label: typeof widget.label === "string" ? widget.label : "",
      type: typeof widget.type === "string" ? widget.type : "",
    }));
}

export { listDashboardWidgets, MAX_SOURCE_BYTES, readWidgetSource, uploadWidgetSource };
export type { DashboardWidget, TransportContext, UploadOutcome, UploadResponse };
