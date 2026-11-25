import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { installFetchMock } from "../test-utils/mock-fetch.js";

const CONTEXT = { apiURL: "https://api.us-e1.tago.io", token: "SENTINEL_TOKEN" };
const DASHBOARD = "6a68b4f5e4b1e5000b5ab1ef";
const WIDGET = "6ad1084c174a0b000cb231a4";
const PROFILE = "6a91f697b1ccff000c3eb271";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("uploadWidgetSource", () => {
  let fetchMock: ReturnType<typeof installFetchMock>;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("posts the source as base64 to the widget upload route", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: true, result: { success: true, error: null, warnings: [], artifact_url: "https://files/x.html" } }));
    const { uploadWidgetSource } = await import("./custom-widget-transport.js");

    const response = await uploadWidgetSource(CONTEXT, { dashboardID: DASHBOARD, widgetID: WIDGET, source: "export default 1;" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.us-e1.tago.io/dashboard/${DASHBOARD}/widget/${WIDGET}/upload`);
    expect(init.headers).toEqual({ "content-type": "application/json", token: "SENTINEL_TOKEN" });
    expect(JSON.parse(init.body)).toEqual({ file: Buffer.from("export default 1;").toString("base64"), file_name: "widget.tsx" });
    expect(response).toEqual({ kind: "outcome", outcome: { success: true, error: null, warnings: [], artifactURL: "https://files/x.html" } });
  });

  /** Probed: a TSX that does not parse comes back as HTTP 200 with success false and the bundler's error. */
  test("a bundle failure is an outcome, not a request error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: true, result: { success: false, error: "rolldown generate failed: PARSE_ERROR", warnings: [] } }));
    const { uploadWidgetSource } = await import("./custom-widget-transport.js");

    const response = await uploadWidgetSource(CONTEXT, { dashboardID: DASHBOARD, widgetID: WIDGET, source: "x" });

    expect(response).toEqual({ kind: "outcome", outcome: { success: false, error: "rolldown generate failed: PARSE_ERROR", warnings: [], artifactURL: null } });
  });

  test("a 429 reports the Retry-After seconds", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: false, message: "Too many requests" }, 429, { "retry-after": "42" }));
    const { uploadWidgetSource } = await import("./custom-widget-transport.js");

    expect(await uploadWidgetSource(CONTEXT, { dashboardID: DASHBOARD, widgetID: WIDGET, source: "x" })).toEqual({
      kind: "rate_limited",
      retryAfterSeconds: 42,
    });
  });

  test("a refused request carries the API message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: false, message: "You have exceeded the maximum limit of File Storage (200 MB)" }, 400));
    const { uploadWidgetSource } = await import("./custom-widget-transport.js");

    expect(await uploadWidgetSource(CONTEXT, { dashboardID: DASHBOARD, widgetID: WIDGET, source: "x" })).toEqual({
      kind: "request_error",
      message: "You have exceeded the maximum limit of File Storage (200 MB)",
    });
  });

  test("an id that is not 24 hex characters never reaches a request", async () => {
    const { uploadWidgetSource } = await import("./custom-widget-transport.js");

    await expect(uploadWidgetSource(CONTEXT, { dashboardID: "../profile", widgetID: WIDGET, source: "x" })).rejects.toThrow(/Invalid dashboard ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("readWidgetSource", () => {
  let fetchMock: ReturnType<typeof installFetchMock>;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("resolves the signed URL, then downloads without the profile token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: true, result: "https://storage.example/signed?sig=SECRET" }));
    fetchMock.mockResolvedValueOnce(new Response("export default App;"));
    const { readWidgetSource } = await import("./custom-widget-transport.js");

    expect(await readWidgetSource(CONTEXT, { profileID: PROFILE, widgetID: WIDGET })).toBe("export default App;");
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.us-e1.tago.io/file/${PROFILE}/widgets/${WIDGET}.tsx?noRedirect=true`);
    expect(fetchMock.mock.calls[1][1].headers).toBeUndefined();
  });

  test("a widget without uploaded source reads as null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: false, message: "file can't be found" }, 404));
    const { readWidgetSource } = await import("./custom-widget-transport.js");

    expect(await readWidgetSource(CONTEXT, { profileID: PROFILE, widgetID: WIDGET })).toBeNull();
  });

  test("a failed resolution names the API message, never the signed URL", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: false, message: "Authorization denied" }, 400));
    const { readWidgetSource } = await import("./custom-widget-transport.js");

    await expect(readWidgetSource(CONTEXT, { profileID: PROFILE, widgetID: WIDGET })).rejects.toThrow(
      "Could not resolve the widget source: Authorization denied",
    );
  });
});

describe("listDashboardWidgets", () => {
  let fetchMock: ReturnType<typeof installFetchMock>;

  beforeEach(() => {
    fetchMock = installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("reads the dashboard's widgets in one request and keeps only id, label and type", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: true,
        result: [
          { id: WIDGET, label: "Users", type: "iframe", token: "WIDGET_TOKEN", display: { url: "x" } },
          { id: "6ad1084c174a0b000cb231a5", label: "Gauge", type: "angular" },
          null,
        ],
      }),
    );
    const { listDashboardWidgets } = await import("./custom-widget-transport.js");

    const widgets = await listDashboardWidgets(CONTEXT, DASHBOARD);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.us-e1.tago.io/dashboard/${DASHBOARD}/widgets`);
    expect(init.headers).toEqual({ token: "SENTINEL_TOKEN" });
    expect(widgets).toEqual([
      { id: WIDGET, label: "Users", type: "iframe" },
      { id: "6ad1084c174a0b000cb231a5", label: "Gauge", type: "angular" },
    ]);
    expect(JSON.stringify(widgets)).not.toContain("WIDGET_TOKEN");
  });

  test("an invalid dashboard ID fails before any request", async () => {
    const { listDashboardWidgets } = await import("./custom-widget-transport.js");

    await expect(listDashboardWidgets(CONTEXT, "../x")).rejects.toThrow(/Invalid dashboard ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    [401, { status: false, message: "Authorization denied" }, /Authorization denied/],
    [404, { status: false, message: "Dashboard not found" }, /Dashboard not found/],
    [502, "not json", /HTTP 502/],
  ])("HTTP %i fails with the API message", async (status, body, message) => {
    fetchMock.mockResolvedValue(typeof body === "string" ? new Response(body, { status }) : jsonResponse(body, status));
    const { listDashboardWidgets } = await import("./custom-widget-transport.js");

    await expect(listDashboardWidgets(CONTEXT, DASHBOARD)).rejects.toThrow(message);
  });

  test("a 429 asks to wait and try again", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: false, message: "Too many requests" }, 429));
    const { listDashboardWidgets } = await import("./custom-widget-transport.js");

    await expect(listDashboardWidgets(CONTEXT, DASHBOARD)).rejects.toThrow(/wait a minute and try again/);
  });
});
