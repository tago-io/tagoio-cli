import { describe, expect, it } from "vitest";

import { _buildCMD } from "./run-analysis";

describe("buildCMD", () => {
  it("should return the correct command when tsnd is false and debug and clear are false", () => {
    const options = { tsnd: false, debug: false, clear: false };
    const result = _buildCMD(options);
    expect(result).toContain("node");
    expect(result).toContain("--watch");
    expect(result).toContain("@swc-node/register/index");
    expect(result).not.toContain("--inspect");
    expect(result).not.toContain("--clear");
    expect(result).not.toContain("tsnd");
  });

  it("should return the correct command when tsnd is true and debug and clear are false", () => {
    const options = { tsnd: true, debug: false, clear: false };
    const result = _buildCMD(options);
    expect(result).toBe("tsnd ");
  });

  it("should return the correct command when tsnd is true and debug is true and clear is false", () => {
    const options = { tsnd: true, debug: true, clear: false };
    const result = _buildCMD(options);
    expect(result).toBe("tsnd --inspect -- ");
  });

  it("should return the correct command when tsnd is true and debug is false and clear is true", () => {
    const options = { tsnd: true, debug: false, clear: true };
    const result = _buildCMD(options);
    expect(result).toBe("tsnd --clear ");
  });

  it("should return the correct command when tsnd is false and debug is true and clear is false", () => {
    const options = { tsnd: false, debug: true, clear: false };
    const result = _buildCMD(options);
    expect(result).toContain("node");
    expect(result).toContain("--watch");
    expect(result).toContain("--inspect");
    expect(result).toContain("@swc-node/register/index");
    expect(result).not.toContain("--clear");
    expect(result).not.toContain("tsnd");
  });

  it("should return the correct command when tsnd is false and debug is false and clear is true", () => {
    const options = { tsnd: false, debug: false, clear: true };
    const result = _buildCMD(options);
    expect(result).toContain("node");
    expect(result).toContain("--watch");
    expect(result).toContain("@swc-node/register/index");
    expect(result).toContain("--clear");
    expect(result).not.toContain("--inspect");
    expect(result).not.toContain("tsnd");
  });
});
