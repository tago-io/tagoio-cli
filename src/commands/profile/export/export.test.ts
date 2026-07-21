import prompts from "prompts";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { resetInjectedPrompts } from "../../../test-utils/reset-prompts.js";

const setupExportMock = vi.fn();
const runInfoMock = vi.fn();
const profilesInfoMock = vi.fn();

vi.mock("@tago-io/sdk", () => ({
  Account: function Account() {
    return {
      run: { info: (...args: unknown[]) => runInfoMock(...args) },
      profiles: { info: (...args: unknown[]) => profilesInfoMock(...args) },
    };
  },
}));

vi.mock("./export-setup.js", () => ({
  setupExport: setupExportMock,
}));

vi.mock("../../../lib/add-to-gitignore.js", () => ({
  addOnGitIgnore: vi.fn(),
}));

vi.mock("../../../lib/get-current-folder.js", () => ({
  getCurrentFolder: () => "/tmp/test",
}));

vi.mock("../../../lib/resolve-scope.js", () => ({
  resolveScope: () => ({
    scope: "local" as const,
    root: "/tmp/test",
    configPath: "/tmp/test/tagoconfig.json",
    envFilePath: "/tmp/test/.tagoio/personal.env",
    configExists: true,
  }),
}));

vi.mock("../../../lib/scope-notice.js", () => ({
  printScopeBanner: vi.fn(),
}));

vi.mock("../../../lib/config-file.js", () => ({
  getEnvironmentConfig: vi.fn(),
}));

vi.mock("../../../lib/messages.js", () => ({
  errorHandler: vi.fn((str: unknown) => {
    throw new Error(String(str));
  }),
  infoMSG: vi.fn(),
  successMSG: vi.fn(),
}));

vi.mock("../../../prompt/confirm.js", () => ({
  confirmPrompt: vi.fn(),
}));

vi.mock("../../../prompt/pick-environment.js", () => ({
  pickEnvironment: vi.fn(),
}));

const passthrough = (...args: unknown[]) => Promise.resolve(args[2] ?? {});
vi.mock("./services/access-export.js", () => ({ accessExport: vi.fn(passthrough) }));
vi.mock("./services/actions-export.js", () => ({ actionsExport: vi.fn(passthrough) }));
vi.mock("./services/analysis-export.js", () => ({ analysisExport: vi.fn(passthrough) }));
vi.mock("./services/collect-ids.js", () => ({ collectIDs: vi.fn((_a, _b, _t, holder) => Promise.resolve(holder)) }));
vi.mock("./services/dashboards-export.js", () => ({ dashboardExport: vi.fn(passthrough) }));
vi.mock("./services/devices-export.js", () => ({ deviceExport: vi.fn(passthrough) }));
vi.mock("./services/dictionary-export.js", () => ({ dictionaryExport: vi.fn(passthrough) }));
vi.mock("./services/run-buttons-export.js", () => ({ runButtonsExport: vi.fn(passthrough) }));

describe("startExport", () => {
  beforeEach(() => {
    setupExportMock.mockReset();
    resetInjectedPrompts();
  });

  test("delegates to setupExport when options.setup is provided", async () => {
    const { startExport } = await import("./export.js");
    await startExport({
      from: "prod",
      to: "dev",
      entity: [],
      setup: "./config.json",
    });

    expect(setupExportMock).toHaveBeenCalled();
  });
});

describe("enterExportTag", () => {
  beforeEach(() => {
    resetInjectedPrompts();
  });

  test("returns the entered tag value", async () => {
    prompts.inject(["my-export-tag"]);

    const { enterExportTag } = await import("./export.js");
    const result = await enterExportTag("default-tag");
    expect(result).toBe("my-export-tag");
  });
});

describe("chooseEntities", () => {
  beforeEach(() => {
    resetInjectedPrompts();
  });

  test("returns selected entities from the prompt", async () => {
    prompts.inject([["devices", "analysis"]]);

    const { chooseEntities } = await import("./export.js");
    const result = await chooseEntities([]);
    expect(result).toEqual(["devices", "analysis"]);
  });
});

describe("ENTITY_ORDER", () => {
  test("contains the expected entity names in order", async () => {
    const { ENTITY_ORDER } = await import("./export.js");
    expect(ENTITY_ORDER).toEqual(["devices", "analysis", "dashboards", "access", "run", "actions", "dictionaries"]);
  });
});

describe("startExport end-to-end", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetInjectedPrompts();

    const { getEnvironmentConfig } = await import("../../../lib/config-file.js");
    (getEnvironmentConfig as ReturnType<typeof vi.fn>).mockImplementation((env: string) => ({
      profileToken: env === "prod" ? "tok-prod" : "tok-dev",
      profileRegion: "usa-1",
    }));

    const { confirmPrompt } = await import("../../../prompt/confirm.js");
    (confirmPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    runInfoMock.mockResolvedValue({ name: "Run App", url: "run.x" });
    profilesInfoMock.mockImplementation(async function (this: unknown) {
      // `this` is the Account instance — differentiate by token via closure
      return { info: { name: "Prof", id: "default" } };
    });
  });

  test("runs through every entity branch when all entities are selected", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["devices", "analysis", "dashboards", "access", "run", "actions", "dictionaries"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({
      from: "prod",
      to: "dev",
      entity: [],
      setup: "",
    });

    const { deviceExport } = await import("./services/devices-export.js");
    const { analysisExport } = await import("./services/analysis-export.js");
    const { dashboardExport } = await import("./services/dashboards-export.js");
    const { accessExport } = await import("./services/access-export.js");
    const { runButtonsExport } = await import("./services/run-buttons-export.js");
    const { actionsExport } = await import("./services/actions-export.js");
    const { dictionaryExport } = await import("./services/dictionary-export.js");

    expect(deviceExport).toHaveBeenCalled();
    expect(analysisExport).toHaveBeenCalled();
    expect(dashboardExport).toHaveBeenCalled();
    expect(accessExport).toHaveBeenCalled();
    expect(runButtonsExport).toHaveBeenCalled();
    expect(actionsExport).toHaveBeenCalled();
    expect(dictionaryExport).toHaveBeenCalled();
  });

  test("errors out when RUN is not enabled on the import account", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    runInfoMock.mockReset();
    runInfoMock.mockResolvedValue({ name: null });

    prompts.inject([["run"], "tag"]);

    const { startExport } = await import("./export.js");
    await expect(
      startExport({
        from: "prod",
        to: "dev",
        entity: [],
        setup: "",
      }),
    ).rejects.toThrow(/RUN/);
  });

  test("errors out when source and target profile IDs match", async () => {
    // Both profiles.info calls return the same ID — triggers the "same profile" guard
    profilesInfoMock.mockResolvedValue({ info: { name: "Shared", id: "p-same" } });

    prompts.inject([["devices"], "tag"]);

    const { startExport } = await import("./export.js");
    await expect(
      startExport({
        from: "prod",
        to: "dev",
        entity: [],
        setup: "",
      }),
    ).rejects.toThrow(/same profile/);
  });

  test("errors out when the user declines the confirmation prompt", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    const { confirmPrompt } = await import("../../../prompt/confirm.js");
    (confirmPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    prompts.inject([["devices"], "tag"]);

    const { startExport } = await import("./export.js");
    await expect(
      startExport({
        from: "prod",
        to: "dev",
        entity: [],
        setup: "",
      }),
    ).rejects.toThrow(/Cancelled/);
  });

  test("errors out when export profile info fetch fails", async () => {
    profilesInfoMock.mockRejectedValueOnce(new Error("api down"));

    prompts.inject([["devices"], "tag"]);

    const { startExport } = await import("./export.js");
    await expect(
      startExport({
        from: "prod",
        to: "dev",
        entity: [],
        setup: "",
      }),
    ).rejects.toThrow(/Export profile/);
  });

  test("running only 'analysis' collects devices IDs first", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["analysis"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({
      from: "prod",
      to: "dev",
      entity: [],
      setup: "",
    });

    const { collectIDs } = await import("./services/collect-ids.js");
    expect(collectIDs).toHaveBeenCalledWith(expect.anything(), expect.anything(), "devices", expect.anything());
  });

  test("running only 'dashboards' collects analysis and devices IDs first", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["dashboards"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({
      from: "prod",
      to: "dev",
      entity: [],
      setup: "",
    });

    const { collectIDs } = await import("./services/collect-ids.js");
    expect(collectIDs).toHaveBeenCalledWith(expect.anything(), expect.anything(), "analysis", expect.anything());
    expect(collectIDs).toHaveBeenCalledWith(expect.anything(), expect.anything(), "devices", expect.anything());
  });

  test("running only 'access' collects devices and dashboards IDs first", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["access"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({
      from: "prod",
      to: "dev",
      entity: [],
      setup: "",
    });

    const { collectIDs } = await import("./services/collect-ids.js");
    expect(collectIDs).toHaveBeenCalledWith(expect.anything(), expect.anything(), "dashboards", expect.anything());
  });

  test("running only 'actions' collects devices IDs first", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["actions"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({
      from: "prod",
      to: "dev",
      entity: [],
      setup: "",
    });

    const { actionsExport } = await import("./services/actions-export.js");
    expect(actionsExport).toHaveBeenCalled();
  });

  test("running only 'run' collects dashboards IDs first", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["run"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({
      from: "prod",
      to: "dev",
      entity: [],
      setup: "",
    });

    const { runButtonsExport } = await import("./services/run-buttons-export.js");
    expect(runButtonsExport).toHaveBeenCalled();
  });

  test("prompts to skip custom widgets when dashboards are selected", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["dashboards"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({ from: "prod", to: "dev", entity: [], setup: "" });

    const { confirmPrompt } = await import("../../../prompt/confirm.js");
    expect(confirmPrompt).toHaveBeenCalledWith("Skip custom (iframe) widgets when exporting dashboards?");
  });

  test("does not prompt to skip custom widgets when dashboards are not selected", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    prompts.inject([["devices"], "my-tag"]);

    const { startExport } = await import("./export.js");
    await startExport({ from: "prod", to: "dev", entity: [], setup: "" });

    const { confirmPrompt } = await import("../../../prompt/confirm.js");
    expect(confirmPrompt).not.toHaveBeenCalledWith("Skip custom (iframe) widgets when exporting dashboards?");
  });

  test("resolves tokens via pickEnvironment when from/to are not provided", async () => {
    let call = 0;
    profilesInfoMock.mockImplementation(async () => {
      call += 1;
      return call === 1 ? { info: { name: "Export", id: "p-export" } } : { info: { name: "Import", id: "p-import" } };
    });

    const { pickEnvironment } = await import("../../../prompt/pick-environment.js");
    (pickEnvironment as ReturnType<typeof vi.fn>).mockResolvedValueOnce("prod").mockResolvedValueOnce("dev");

    prompts.inject([["devices"], "tag"]);

    const { startExport } = await import("./export.js");
    await startExport({
      from: "",
      to: "",
      entity: [],
      setup: "",
    });
    expect(pickEnvironment).toHaveBeenCalledTimes(2);
  });
});
