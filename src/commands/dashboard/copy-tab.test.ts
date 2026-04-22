import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const confirmPromptMock = vi.fn();
const pickDashboardIDFromTagoIOMock = vi.fn();

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
  highlightMSG: (s: string) => s,
}));

vi.mock("../../prompt/confirm.js", () => ({
  confirmPrompt: confirmPromptMock,
}));

vi.mock("../../prompt/pick-dashboard-id-from-tagoio.js", () => ({
  pickDashboardIDFromTagoIO: pickDashboardIDFromTagoIOMock,
}));

describe("copyTabWidgets", () => {
  const dashInfo = {
    tabs: [
      { key: "tab-a", value: "Tab A", link: "", hidden: false },
      { key: "tab-b", value: "Tab B", link: "", hidden: false },
    ],
    arrangement: [
      { widget_id: "w-1", tab: "tab-a", x: 0, y: 0, width: 4, height: 2 },
      { widget_id: "w-2", tab: "tab-b", x: 0, y: 0, width: 4, height: 2 },
    ],
  };

  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    confirmPromptMock.mockReset();
    pickDashboardIDFromTagoIOMock.mockReset();
    resetInjectedPrompts();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { copyTabWidgets } = await import("./copy-tab.js");
    await expect(
      copyTabWidgets("dash-id", { from: "tab-a", to: "tab-b", environment: "prod", amount: 1 }),
    ).rejects.toThrow(/Environment not found/);
  });

  test("rejects copying from and to the same tab", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.dashboards.info.mockResolvedValue(dashInfo);

    const { copyTabWidgets } = await import("./copy-tab.js");
    await expect(
      copyTabWidgets("dash-id", { from: "tab-a", to: "tab-a", environment: "prod", amount: 1 }),
    ).rejects.toThrow(/same tab/);
  });

  test("returns early without editing when the user declines confirmation", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.dashboards.info.mockResolvedValue(dashInfo);
    confirmPromptMock.mockResolvedValue(false);

    const { copyTabWidgets } = await import("./copy-tab.js");
    await copyTabWidgets("dash-id", { from: "tab-a", to: "tab-b", environment: "prod", amount: 1 });

    expect(accountInstance.dashboards.edit).not.toHaveBeenCalled();
  });

  test("copies widgets from source tab into the target tab on confirmation", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.dashboards.info.mockResolvedValue({
      tabs: dashInfo.tabs,
      arrangement: dashInfo.arrangement.map((a) => ({ ...a })),
    });
    accountInstance.dashboards.widgets.info.mockResolvedValue({ id: "w-1", type: "display" });
    accountInstance.dashboards.widgets.create.mockResolvedValue({ widget: "w-new" });
    accountInstance.dashboards.widgets.delete.mockResolvedValue(undefined);
    accountInstance.dashboards.edit.mockResolvedValue(undefined);
    confirmPromptMock.mockResolvedValue(true);

    const { copyTabWidgets } = await import("./copy-tab.js");
    await copyTabWidgets("dash-id", { from: "tab-a", to: "tab-b", environment: "prod", amount: 1 });

    expect(accountInstance.dashboards.widgets.delete).toHaveBeenCalledWith("dash-id", "w-2");
    expect(accountInstance.dashboards.widgets.create).toHaveBeenCalled();
    expect(accountInstance.dashboards.edit).toHaveBeenCalledWith(
      "dash-id",
      expect.objectContaining({ arrangement: expect.any(Array) }),
    );
  });

  test("prompts for source and target tabs when they are not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.dashboards.info.mockResolvedValue({
      tabs: dashInfo.tabs,
      arrangement: dashInfo.arrangement.map((a) => ({ ...a })),
    });
    accountInstance.dashboards.widgets.info.mockResolvedValue({ id: "w-1" });
    accountInstance.dashboards.widgets.create.mockResolvedValue({ widget: "w-new" });
    accountInstance.dashboards.edit.mockResolvedValue(undefined);
    confirmPromptMock.mockResolvedValue(true);

    prompts.inject(["tab-a", "tab-b"]);

    const { copyTabWidgets } = await import("./copy-tab.js");
    await copyTabWidgets("dash-id", { from: "", to: "", environment: "prod", amount: 1 } as never);

    expect(accountInstance.dashboards.edit).toHaveBeenCalled();
  });
});
