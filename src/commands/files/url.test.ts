import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";

const { getEnvironmentConfigMock, errorHandlerMock, infoMSGMock, profileInfoMock, getFileURLSignedMock } = vi.hoisted(() => ({
  getEnvironmentConfigMock: vi.fn(),
  errorHandlerMock: vi.fn<(str: unknown) => never>((str) => {
    throw new Error(String(str));
  }),
  infoMSGMock: vi.fn(),
  profileInfoMock: vi.fn(),
  getFileURLSignedMock: vi.fn(),
}));

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return {
      profiles: { info: profileInfoMock },
      files: { getFileURLSigned: getFileURLSignedMock },
    };
  },
}));

vi.mock("../../lib/config-file.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/config-file.js")>();
  return {
    ...actual,
    getEnvironmentConfig: (...args: unknown[]) => getEnvironmentConfigMock(...args),
  };
});

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: infoMSGMock,
  highlightMSG: (s: unknown) => String(s),
}));

import { filesURLCommand } from "./url.js";

describe("filesURLCommand", () => {
  let stdout: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    stdout = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ id: "profile-123" }));
    profileInfoMock.mockResolvedValue({ info: { id: "profile-123" } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("prints the public URL for a remote path on stdout", async () => {
    await filesURLCommand("custom-widgets/line-chart/index.html", {});

    expect(stdout.join("")).toBe("https://api.us-e1.tago.io/file/profile-123/custom-widgets/line-chart/index.html\n");
    expect(getFileURLSignedMock).not.toHaveBeenCalled();
  });

  test("returns a signed URL when --signed is passed", async () => {
    getFileURLSignedMock.mockResolvedValue("https://api.us-e1.tago.io/file/profile-123/private.json?token=abc");

    await filesURLCommand("private.json", { signed: true });

    const built = "https://api.us-e1.tago.io/file/profile-123/private.json";
    expect(getFileURLSignedMock).toHaveBeenCalledWith(built);
    expect(stdout.join("")).toBe("https://api.us-e1.tago.io/file/profile-123/private.json?token=abc\n");
  });

  test("fails fast when no profile token is configured", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await expect(filesURLCommand("a.json", {})).rejects.toThrow(/token/i);
  });

  test("uses the --token override and still builds the URL", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    await filesURLCommand("a.json", { token: "cli-token" });

    expect(stdout.join("")).toBe("https://api.us-e1.tago.io/file/profile-123/a.json\n");
  });

  test("strips a leading slash from the remote path", async () => {
    await filesURLCommand("/custom-widgets/w/index.html", {});

    expect(stdout.join("")).toBe("https://api.us-e1.tago.io/file/profile-123/custom-widgets/w/index.html\n");
  });

  test("uses the region's API URL for a custom region (Europe / TagoDeploy)", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileRegion: { api: "https://api.eu.tago.io", sse: "https://sse.eu.tago.io" } }));

    await filesURLCommand("custom-widgets/w/index.html", {});

    expect(stdout.join("")).toBe("https://api.eu.tago.io/file/profile-123/custom-widgets/w/index.html\n");
  });
});
