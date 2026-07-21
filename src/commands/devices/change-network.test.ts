import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});
const pickDeviceIDFromTagoIOMock = vi.fn();
const promptTextToEnterMock = vi.fn();

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
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
}));

vi.mock("../../lib/resolve-scope.js", () => ({
  resolveScope: () => ({
    scope: "local" as const,
    root: "/repo",
    configPath: "/repo/tagoconfig.json",
    envFilePath: "/repo/.tagoio/personal.env",
    configExists: true,
  }),
}));

vi.mock("../../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("../../prompt/pick-device-id-from-tagoio.js", () => ({
  pickDeviceIDFromTagoIO: (...args: unknown[]) => pickDeviceIDFromTagoIOMock(...args),
}));

vi.mock("../../prompt/text-prompt.js", () => ({
  promptTextToEnter: (...args: unknown[]) => promptTextToEnterMock(...args),
}));

// Strip kleur ANSI codes so assertions are stable.
// oxlint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*m/g, "");

describe("_formatUpdateMessage", () => {
  let _formatUpdateMessage: (deviceID: string, serialNumbers: (string | undefined)[], network: string, connector: string) => string;

  beforeEach(async () => {
    ({ _formatUpdateMessage } = await import("./change-network.js"));
  });

  test("includes device ID, network, and connector as key=value pairs", () => {
    const result = stripAnsi(_formatUpdateMessage("abc123", [], "net-id-1", "conn-id-1"));
    expect(result).toContain("device=abc123");
    expect(result).toContain("network=net-id-1");
    expect(result).toContain("connector=conn-id-1");
  });

  test("omits serial when no serial numbers are present", () => {
    const result = stripAnsi(_formatUpdateMessage("abc123", [], "net-id-1", "conn-id-1"));
    expect(result).not.toContain("serial=");
  });

  test("includes a single serial when one is present", () => {
    const result = stripAnsi(_formatUpdateMessage("abc123", ["SN-001"], "net-id-1", "conn-id-1"));
    expect(result).toContain("serial=SN-001");
  });

  test("joins multiple serials with commas (parseable for scripts)", () => {
    const result = stripAnsi(_formatUpdateMessage("abc123", ["SN-001", "SN-002", "SN-003"], "net-id-1", "conn-id-1"));
    expect(result).toContain("serial=SN-001,SN-002,SN-003");
  });

  test("filters out undefined/empty serial numbers", () => {
    const result = stripAnsi(_formatUpdateMessage("abc123", ["SN-001", undefined, "", "SN-002"], "net-id-1", "conn-id-1"));
    expect(result).toContain("serial=SN-001,SN-002");
  });
});

describe("changeNetworkOrConnector", () => {
  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    pickDeviceIDFromTagoIOMock.mockReset();
    promptTextToEnterMock.mockReset();
    resetInjectedPrompts();
  });

  test("errors out when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));
    const { changeNetworkOrConnector } = await import("./change-network.js");
    await expect(changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "n", connectorID: "c" })).rejects.toThrow(/Environment not found/);
  });

  test("returns silently when no device is picked", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    pickDeviceIDFromTagoIOMock.mockResolvedValue("");
    const { changeNetworkOrConnector } = await import("./change-network.js");
    const result = await changeNetworkOrConnector("", { environment: "prod", networkID: "n", connectorID: "c" });
    expect(result).toBeUndefined();
  });

  test("returns silently when device info cannot be fetched", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockRejectedValue(new Error("404"));
    errorHandlerMock.mockImplementationOnce(() => undefined);
    const { changeNetworkOrConnector } = await import("./change-network.js");
    const result = await changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "n", connectorID: "c" });
    expect(result).toBeUndefined();
  });

  test("errors when network and connector are already set to the device", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "n", connector: "c" });
    const { changeNetworkOrConnector } = await import("./change-network.js");
    await expect(changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "n", connectorID: "c" })).rejects.toThrow(/already set/);
  });

  test("prompts for network and connector when not provided", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([]);
    accountInstance.devices.edit.mockResolvedValue(undefined);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-net" });
    accountInstance.integration.connectors.info.mockResolvedValue({ id: "new-conn" });
    promptTextToEnterMock.mockResolvedValueOnce("new-net").mockResolvedValueOnce("new-conn");

    const { changeNetworkOrConnector } = await import("./change-network.js");
    await changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "", connectorID: "" });
    expect(promptTextToEnterMock).toHaveBeenCalledTimes(2);
    expect(accountInstance.devices.edit).toHaveBeenCalledWith("dev-id", expect.objectContaining({ network: "new-net", connector: "new-conn", active: true }));
  });

  test("errors when both network and connector prompts return empty", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "n", connector: "c" });
    promptTextToEnterMock.mockResolvedValueOnce("").mockResolvedValueOnce("");

    const { changeNetworkOrConnector } = await import("./change-network.js");
    await expect(changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "", connectorID: "" })).rejects.toThrow(
      /Network or Connector ID is required/,
    );
  });

  test("uses device's current network/connector when only one of them is overridden", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([]);
    accountInstance.devices.edit.mockResolvedValue(undefined);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-n" });
    accountInstance.integration.connectors.info.mockResolvedValue({ id: "old-c" });

    const { changeNetworkOrConnector } = await import("./change-network.js");
    // Only network provided → connector falls back to deviceInfo.connector
    await changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "new-n", connectorID: "" });

    expect(accountInstance.devices.edit).toHaveBeenCalledWith("dev-id", expect.objectContaining({ network: "new-n", connector: "old-c" }));
  });

  test("recreates tokens preserving serial numbers", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([
      { token: "t1", name: "T1", serie_number: "SN-1" },
      { token: "t2", name: "T2", serie_number: undefined },
    ]);
    accountInstance.devices.tokenDelete.mockResolvedValue(undefined);
    accountInstance.devices.edit.mockResolvedValue(undefined);
    accountInstance.devices.tokenCreate.mockResolvedValue(undefined);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-net" });
    accountInstance.integration.connectors.info.mockResolvedValue({ id: "new-conn" });

    const { changeNetworkOrConnector } = await import("./change-network.js");
    await changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "new-net", connectorID: "new-conn" });

    expect(accountInstance.devices.tokenDelete).toHaveBeenCalledTimes(2);
    expect(accountInstance.devices.tokenCreate).toHaveBeenNthCalledWith(
      1,
      "dev-id",
      expect.objectContaining({ serie_number: "SN-1", name: "T1", permission: "full" }),
    );
    expect(accountInstance.devices.tokenCreate).toHaveBeenNthCalledWith(
      2,
      "dev-id",
      expect.objectContaining({ serie_number: undefined, name: "T2", permission: "full" }),
    );
  });

  test("validates network/connector BEFORE deleting tokens — invalid connector deletes nothing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([{ token: "t1", name: "T1", serie_number: "SN-1" }]);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-net" });
    accountInstance.integration.connectors.info.mockRejectedValue(new Error("Connector can't be found"));

    const { changeNetworkOrConnector } = await import("./change-network.js");
    await expect(
      changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "new-net", connectorID: "bad-conn" }),
    ).rejects.toThrow(/connector/i);

    expect(accountInstance.devices.tokenDelete).not.toHaveBeenCalled();
    expect(accountInstance.devices.edit).not.toHaveBeenCalled();
  });

  test("recreates tokens before surfacing a failed edit (no process.exit before recreate)", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([{ token: "t1", name: "T1", serie_number: "SN-1" }]);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-net" });
    accountInstance.integration.connectors.info.mockResolvedValue({ id: "new-conn" });
    accountInstance.devices.tokenDelete.mockResolvedValue(undefined);
    accountInstance.devices.edit.mockRejectedValue(new Error("transient API error"));
    accountInstance.devices.tokenCreate.mockResolvedValue(undefined);

    const { changeNetworkOrConnector } = await import("./change-network.js");
    await expect(
      changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "new-net", connectorID: "new-conn" }),
    ).rejects.toThrow(/Failed to change network\/connector/);

    // The edit failed, but the deleted token MUST be recreated first so the
    // device is never left tokenless. The edit error is captured (not exited on)
    // precisely so this recreate runs before the error is surfaced.
    expect(accountInstance.devices.tokenCreate).toHaveBeenCalledWith(
      "dev-id",
      expect.objectContaining({ name: "T1", serie_number: "SN-1", permission: "full" }),
    );
  });

  test("warns with the lost tokens when recreate fails", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([{ token: "t1", name: "MyToken", serie_number: "SN-9" }]);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-net" });
    accountInstance.integration.connectors.info.mockResolvedValue({ id: "new-conn" });
    accountInstance.devices.tokenDelete.mockResolvedValue(undefined);
    accountInstance.devices.edit.mockResolvedValue(undefined);
    accountInstance.devices.tokenCreate.mockRejectedValue(new Error("rate limited"));

    const { changeNetworkOrConnector } = await import("./change-network.js");
    await expect(
      changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "new-net", connectorID: "new-conn" }),
    ).rejects.toThrow(/MyToken/);
  });

  test("recreate failure on the second token does not report the first (already recreated) as lost", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([
      { token: "t1", name: "FirstToken", serie_number: "SN-1" },
      { token: "t2", name: "SecondToken", serie_number: "SN-2" },
    ]);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-net" });
    accountInstance.integration.connectors.info.mockResolvedValue({ id: "new-conn" });
    accountInstance.devices.tokenDelete.mockResolvedValue(undefined);
    accountInstance.devices.edit.mockResolvedValue(undefined);
    // First recreate succeeds, second fails.
    accountInstance.devices.tokenCreate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("rate limited"));

    const { changeNetworkOrConnector } = await import("./change-network.js");
    const promise = changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "new-net", connectorID: "new-conn" });

    // Only the token that actually failed must be reported as lost.
    await expect(promise).rejects.toThrow(/SecondToken/);
    await expect(promise).rejects.not.toThrow(/FirstToken/);
    // Both recreate attempts ran (the loop is not short-circuited on the first failure).
    expect(accountInstance.devices.tokenCreate).toHaveBeenCalledTimes(2);
  });

  test("propagates the original edit error when recreate succeeds (no masking)", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ name: "Dev", network: "old-n", connector: "old-c" });
    accountInstance.devices.tokenList.mockResolvedValue([{ token: "t1", name: "T1", serie_number: "SN-1" }]);
    accountInstance.integration.networks.info.mockResolvedValue({ id: "new-net" });
    accountInstance.integration.connectors.info.mockResolvedValue({ id: "new-conn" });
    accountInstance.devices.tokenDelete.mockResolvedValue(undefined);
    accountInstance.devices.edit.mockRejectedValue(new Error("EDIT_BOOM"));
    accountInstance.devices.tokenCreate.mockResolvedValue(undefined);

    const { changeNetworkOrConnector } = await import("./change-network.js");
    // The edit error must still surface after the tokens are recreated.
    await expect(
      changeNetworkOrConnector("dev-id", { environment: "prod", networkID: "new-net", connectorID: "new-conn" }),
    ).rejects.toThrow(/EDIT_BOOM/);
    expect(accountInstance.devices.tokenCreate).toHaveBeenCalledTimes(1);
  });
});
