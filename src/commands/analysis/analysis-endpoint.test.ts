import { beforeEach, describe, expect, test, vi } from "vitest";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
}));

describe("parseAnalysisEndpoint", () => {
  beforeEach(() => {
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
  });

  test("returns undefined without endpoint flags, so the field is left alone", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(parseAnalysisEndpoint({})).toBeUndefined();
  });

  test("--enable-endpoint with --endpoint-access sends both fields", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(parseAnalysisEndpoint({ enableEndpoint: true, endpointAccess: "public" })).toEqual({ active: true, access: "public" });
  });

  test("--disable-endpoint sends active false", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(parseAnalysisEndpoint({ disableEndpoint: true })).toEqual({ active: false });
  });

  /**
   * Probed against a live profile: the API merges `endpoint`, so sending only
   * `access` keeps the Endpoint on or off as it was.
   */
  test("--endpoint-access alone sends only access", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(parseAnalysisEndpoint({ endpointAccess: "token" })).toEqual({ access: "token" });
  });

  test("--enable-endpoint and --disable-endpoint together fail offline", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(() => parseAnalysisEndpoint({ enableEndpoint: true, disableEndpoint: true })).toThrow(/conflicting_flags/);
  });

  test("an unknown --endpoint-access fails offline and names the valid values", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(() => parseAnalysisEndpoint({ endpointAccess: "private" })).toThrow(/invalid_endpoint_access.*public, token/);
  });

  test("an empty --endpoint-access fails instead of being ignored", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(() => parseAnalysisEndpoint({ enableEndpoint: true, endpointAccess: "" })).toThrow(/invalid_endpoint_access/);
  });

  test("routes errors through the JSON channel when --json is set", async () => {
    const { parseAnalysisEndpoint } = await import("./analysis-endpoint.js");

    expect(() => parseAnalysisEndpoint({ endpointAccess: "private", json: true })).toThrow(/json:invalid_endpoint_access/);
  });
});

describe("formatEndpoint", () => {
  test("shows the state and the access mode", async () => {
    const { formatEndpoint } = await import("./analysis-endpoint.js");

    expect(formatEndpoint({ active: true, access: "public" })).toBe("on (public)");
    expect(formatEndpoint({ active: false, access: "token" })).toBe("off (token)");
  });

  test("shows only the state when the API sends no access", async () => {
    const { formatEndpoint } = await import("./analysis-endpoint.js");

    expect(formatEndpoint({ active: true })).toBe("on");
  });

  test("returns undefined when the API sends no endpoint", async () => {
    const { formatEndpoint } = await import("./analysis-endpoint.js");

    expect(formatEndpoint(undefined)).toBeUndefined();
  });
});
