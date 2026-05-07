import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { captureOutput } from "./capture-output.js";
import { makeEnvironmentConfig } from "./mock-config.js";
import { makeAccount } from "./mock-sdk.js";

describe("test-utils", () => {
  describe("makeAccount", () => {
    test("returns an object with resource namespaces populated with vi.fn() stubs", () => {
      const account = makeAccount();
      expect(vi.isMockFunction(account.devices.info)).toBe(true);
      expect(vi.isMockFunction(account.analysis.list)).toBe(true);
      expect(vi.isMockFunction(account.profiles.info)).toBe(true);
    });

    test("allows overriding individual method behavior", async () => {
      const account = makeAccount();
      account.devices.info.mockResolvedValue({ id: "dev-1", name: "Sensor" } as never);
      const result = await account.devices.info("dev-1");
      expect(result).toEqual({ id: "dev-1", name: "Sensor" });
    });

    test("supports deep namespaces (e.g. dashboards.widgets)", () => {
      const account = makeAccount();
      expect(vi.isMockFunction(account.dashboards.widgets.info)).toBe(true);
    });
  });

  describe("makeEnvironmentConfig", () => {
    test("returns a config with a default profileToken and profileRegion", () => {
      const config = makeEnvironmentConfig();
      expect(config.profileToken).toBe("fake-token");
      expect(config.profileRegion).toBe("us-e1");
    });

    test("allows overrides to merge into the default shape", () => {
      const config = makeEnvironmentConfig({ profileToken: "custom", analysisPath: "./custom" });
      expect(config.profileToken).toBe("custom");
      expect(config.analysisPath).toBe("./custom");
      expect(config.profileRegion).toBe("us-e1");
    });
  });

  describe("captureOutput", () => {
    let capture: ReturnType<typeof captureOutput>;

    beforeEach(() => {
      capture = captureOutput();
    });

    afterEach(() => {
      capture.restore();
    });

    test("captures console.info with ANSI stripped", () => {
      console.info("\x1B[32mhello\x1B[0m");
      expect(capture.stdout()).toContain("hello");
      expect(capture.stdout()).not.toContain("\x1B");
    });

    test("captures console.error separately from console.info", () => {
      console.error("boom");
      console.info("ok");
      expect(capture.stderr()).toContain("boom");
      expect(capture.stdout()).toContain("ok");
      expect(capture.stderr()).not.toContain("ok");
    });

    test("process.exit throws instead of terminating the test runner", () => {
      expect(() => process.exit(1)).toThrow("__exit:1");
    });
  });
});
