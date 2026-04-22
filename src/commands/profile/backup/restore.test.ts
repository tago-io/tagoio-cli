import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../../test-utils/mock-config.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});

const resourcesProfilesInfoMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return {
      profiles: {
        info: (...args: unknown[]) => resourcesProfilesInfoMock(...args),
      },
    };
  },
}));

vi.mock("unzipper", () => ({
  default: { Extract: vi.fn() },
  Extract: vi.fn(),
}));

vi.mock("../../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../../lib/display-warning.js", () => ({
  displayWarning: vi.fn(),
}));

vi.mock("../../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
  highlightMSG: (s: unknown) => String(s),
}));

vi.mock("../../../prompt/choose-from-list.js", () => ({
  chooseFromList: vi.fn(),
}));

vi.mock("../../../prompt/confirm.js", () => ({
  confirmPrompt: vi.fn(),
}));

describe("restoreBackup", () => {
  beforeEach(() => {
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    resourcesProfilesInfoMock.mockReset();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { restoreBackup } = await import("./restore.js");
    await expect(restoreBackup()).rejects.toThrow(/Environment not found/);
  });

  test("returns silently when profile info fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    resourcesProfilesInfoMock.mockRejectedValue(new Error("denied"));
    errorHandlerMock.mockImplementationOnce(() => undefined);

    const { restoreBackup } = await import("./restore.js");
    const result = await restoreBackup();
    expect(result).toBeUndefined();
  });
});
