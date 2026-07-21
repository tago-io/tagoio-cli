import { describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources(this: Record<string, unknown>, params: unknown) {
    this.params = params;
  },
}));

vi.mock("./config-file.js", () => ({
  getEnvironmentConfig: (...args: unknown[]) => getEnvironmentConfigMock(...args),
}));

vi.mock("./messages.js", () => ({
  errorHandler: errorHandlerMock,
}));

import { resolveResources } from "./resolve-resources.js";

describe("resolveResources", () => {
  test("builds a Resources client from the environment config and returns the region", () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "tok-1", profileRegion: "us-e1" }));

    const { resources, region } = resolveResources({ environment: "dev" });
    const params = (resources as unknown as { params: { token: string; region: string } }).params;

    expect(getEnvironmentConfigMock).toHaveBeenCalledWith("dev");
    expect(params).toEqual({ token: "tok-1", region: "us-e1" });
    expect(region).toBe("us-e1");
  });

  test("applies the --token override", () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { resources } = resolveResources({ token: "cli-token" });
    const params = (resources as unknown as { params: { token: string } }).params;

    expect(params.token).toBe("cli-token");
  });

  test("errors when the environment is not found", () => {
    getEnvironmentConfigMock.mockReturnValue(undefined);

    expect(() => resolveResources({})).toThrow(/environment/i);
  });

  test("errors when no token is configured", () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    expect(() => resolveResources({})).toThrow(/token/i);
  });
});
