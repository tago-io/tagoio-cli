import { beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";
import { resetInjectedPrompts } from "../../test-utils/reset-prompts.js";

type SSECallback = (event?: unknown) => void;
const eventSourceInstances: Array<{ url: string; onmessage?: SSECallback; onerror?: SSECallback; onopen?: SSECallback }> = [];
const getEnvironmentConfigMock = vi.fn();
const errorHandlerMock = vi.fn((str: unknown): void => {
  throw new Error(String(str));
});

let accountInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return accountInstance;
  },
  Device: function Device() {
    return { info: vi.fn().mockRejectedValue(new Error("no device")) };
  },
}));

vi.mock("eventsource", () => ({
  EventSource: function EventSource(url: string) {
    const inst = { url, onmessage: undefined, onerror: undefined, onopen: undefined };
    eventSourceInstances.push(inst);
    return inst;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  successMSG: vi.fn(),
  highlightMSG: (s: string) => s,
}));

describe("inspectorConnection", () => {
  beforeEach(() => {
    accountInstance = makeAccount();
    getEnvironmentConfigMock.mockReset();
    errorHandlerMock.mockClear();
    eventSourceInstances.length = 0;
    resetInjectedPrompts();
  });

  test("calls errorHandler when the environment is missing", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig({ profileToken: "" }));

    const { inspectorConnection } = await import("./device-live-inspector.js");
    await expect(inspectorConnection("dev-id", { environment: "prod", postOnly: false, getOnly: false })).rejects.toThrow(/Environment not found/);
  });

  test("opens an SSE connection for the resolved device", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "dev-id", name: "MyDevice" });

    const { inspectorConnection } = await import("./device-live-inspector.js");
    await inspectorConnection("dev-id", { environment: "prod", postOnly: false, getOnly: false });

    expect(eventSourceInstances).toHaveLength(1);
    expect(eventSourceInstances[0].url).toContain("channel=device_inspector.dev-id");
  });

  test("onmessage handles single-object scope", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "dev-id", name: "MyDevice" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { inspectorConnection } = await import("./device-live-inspector.js");
    await inspectorConnection("dev-id", { environment: "prod", postOnly: false, getOnly: false });
    const sse = eventSourceInstances[0];
    sse.onmessage?.({
      data: JSON.stringify({
        payload: { timestamp: "2026-01-01", title: "Request", content: "hello" },
      }),
    });

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("onmessage handles array scope payload", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "dev-id", name: "MyDevice" });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { inspectorConnection } = await import("./device-live-inspector.js");
    await inspectorConnection("dev-id", { environment: "prod", postOnly: false, getOnly: false });
    const sse = eventSourceInstances[0];
    sse.onmessage?.({
      data: JSON.stringify({
        payload: [
          { timestamp: "2026-01-01", title: "MQTT", content: { foo: "bar" } },
          { timestamp: "2026-01-02", title: "Other", content: "x" },
        ],
      }),
    });

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test("onopen logs the successMSG", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "dev-id", name: "MyDevice" });

    const { inspectorConnection } = await import("./device-live-inspector.js");
    await inspectorConnection("dev-id", { environment: "prod", postOnly: false, getOnly: false });
    const sse = eventSourceInstances[0];
    expect(() => sse.onopen?.()).not.toThrow();
  });

  test("onerror routes through errorHandler", async () => {
    getEnvironmentConfigMock.mockReturnValue(makeEnvironmentConfig());
    accountInstance.devices.info.mockResolvedValue({ id: "dev-id", name: "MyDevice" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { inspectorConnection } = await import("./device-live-inspector.js");
    await inspectorConnection("dev-id", { environment: "prod", postOnly: false, getOnly: false });
    const sse = eventSourceInstances[0];
    // our errorHandler throws; in onerror we want it to propagate silently via console.error
    errorHandlerMock.mockImplementationOnce(() => undefined);
    sse.onerror?.({ type: "error" });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
