import { beforeEach, describe, expect, test, vi } from "vitest";

const readBackupFileMock = vi.fn();
const selectItemsFromBackupMock = vi.fn();

vi.mock("../lib.js", () => ({
  readBackupFile: readBackupFileMock,
  selectItemsFromBackup: (...args: unknown[]) => selectItemsFromBackupMock(...args),
  getErrorMessage: (e: unknown) => String(e),
}));

vi.mock("../../../../lib/messages.js", () => ({
  infoMSG: vi.fn(),
  highlightMSG: (s: unknown) => String(s),
}));

vi.mock("ora", () => ({
  default: () => ({
    start: () => ({ text: "", succeed: vi.fn(), fail: vi.fn() }),
  }),
}));

describe("restoreDevices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  test("returns zero counts when no devices are in backup", async () => {
    readBackupFileMock.mockReturnValue([]);

    const { restoreDevices } = await import("./devices.js");
    const result = await restoreDevices({} as never, "/tmp/extract");
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("splits devices across create and edit queues", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "dev-new", name: "New Device", network: "n1", connector: "c1" },
      { id: "dev-exists", name: "Existing Device", network: "n2", connector: "c2" },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "dev-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const createMock = vi.fn().mockResolvedValue({ device_id: "dev-new" });
    const paramSetMock = vi.fn().mockResolvedValue(undefined);
    const resources = { devices: { list: listMock, edit: editMock, create: createMock, paramSet: paramSetMock } };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(createMock).toHaveBeenCalled();
    expect(editMock).toHaveBeenCalledWith("dev-exists", expect.objectContaining({ name: "Existing Device" }));
    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("increments failed count when create throws", async () => {
    readBackupFileMock.mockReturnValue([{ id: "dev-boom", name: "Boom", network: "n", connector: "c" }]);

    const resources = {
      devices: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockRejectedValue(new Error("boom")),
        edit: vi.fn(),
      },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 1 });
  });

  test("returns early when granular selection is empty", async () => {
    readBackupFileMock.mockReturnValue([{ id: "dev-1", name: "One", network: "n", connector: "c" }]);
    selectItemsFromBackupMock.mockResolvedValue([]);

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices({} as never, "/tmp/extract", true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ created: 0, updated: 0, failed: 0 });
  });

  test("restores only the items selected in granular mode", async () => {
    readBackupFileMock.mockReturnValue([
      { id: "dev-1", name: "One", network: "n", connector: "c" },
      { id: "dev-2", name: "Two", network: "n", connector: "c" },
    ]);
    selectItemsFromBackupMock.mockResolvedValue([{ id: "dev-1", name: "One", network: "n", connector: "c" }]);

    const createMock = vi.fn().mockResolvedValue({ device_id: "dev-1" });
    const resources = {
      devices: { list: vi.fn().mockResolvedValue([]), create: createMock, edit: vi.fn(), paramSet: vi.fn() },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract", true);
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
  });

  test("restores configuration parameters for created and edited devices, strips server-managed fields, and skips tokens without serie_number", async () => {
    const backupDevice = (id: string) => ({
      id,
      name: `Dev ${id}`,
      network: "n1",
      connector: "c1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      last_input: "2026-01-03T00:00:00Z",
      profile: "profile-x",
      params: [
        { id: "p1", ref_id: id, key: "k1", value: "v1", sent: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
        { id: "p2", ref_id: id, key: "k2", value: "v2", sent: false, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
      ],
      tokens: [{ token: "********-****-****-****-************a888", name: "T1", permission: "full" }],
    });

    readBackupFileMock.mockReturnValue([backupDevice("dev-new"), backupDevice("dev-exists")]);

    const listMock = vi.fn().mockResolvedValue([{ id: "dev-exists" }]);
    const createMock = vi.fn().mockResolvedValue({ device_id: "dev-new-generated" });
    const editMock = vi.fn().mockResolvedValue(undefined);
    const paramSetMock = vi.fn().mockResolvedValue(undefined);
    // Edit path fetches the destination device's current params to reconcile
    // by key. Fixture returns [] → every backup param is a fresh insert, no
    // `id` in the payload.
    const paramListMock = vi.fn().mockResolvedValue([]);
    const tokenCreateMock = vi.fn();
    // Edit path calls tokenList to look up existing serials; the fixture device
    // has no tokens with serie_number anyway, so returning [] keeps the path
    // tight while proving tokenCreate is never reached.
    const tokenListMock = vi.fn().mockResolvedValue([]);
    const resources = {
      devices: {
        list: listMock,
        create: createMock,
        edit: editMock,
        paramSet: paramSetMock,
        paramList: paramListMock,
        tokenCreate: tokenCreateMock,
        tokenList: tokenListMock,
      },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    // paramSet runs on both the newly-created device (using the generated id) and the edited one
    expect(paramSetMock).toHaveBeenCalledTimes(2);

    // paramList is only consulted on the edit path — the create path has no
    // existing params to reconcile.
    expect(paramListMock).toHaveBeenCalledTimes(1);
    expect(paramListMock).toHaveBeenCalledWith("dev-exists");

    // Each param payload is trimmed to the fields the API accepts — metadata
    // like `ref_id` and the ISO-string timestamps would otherwise be
    // rejected with "Expected date, received string". With an empty
    // destination param list, no existing `id` can be reused, so both paths
    // emit key/value/sent only.
    const expectedParamShape = [
      { key: "k1", value: "v1", sent: false },
      { key: "k2", value: "v2", sent: false },
    ];
    expect(paramSetMock).toHaveBeenCalledWith("dev-new-generated", expectedParamShape);
    expect(paramSetMock).toHaveBeenCalledWith("dev-exists", expectedParamShape);

    for (const call of paramSetMock.mock.calls) {
      const paramPayload = call[1] as Array<Record<string, unknown>>;
      for (const p of paramPayload) {
        expect(p).not.toHaveProperty("id");
        expect(p).not.toHaveProperty("ref_id");
        expect(p).not.toHaveProperty("created_at");
        expect(p).not.toHaveProperty("updated_at");
      }
    }

    // Tokens without a serie_number are ephemeral credentials and are skipped.
    // (The fixture's sole token has no serie_number.)
    expect(tokenCreateMock).not.toHaveBeenCalled();

    // Create payload must not carry server-managed fields that the API rejects
    const createPayload = createMock.mock.calls[0][0];
    expect(createPayload).not.toHaveProperty("id");
    expect(createPayload).not.toHaveProperty("created_at");
    expect(createPayload).not.toHaveProperty("updated_at");
    expect(createPayload).not.toHaveProperty("last_input");
    expect(createPayload).not.toHaveProperty("profile");
    expect(createPayload).not.toHaveProperty("params");
    expect(createPayload).not.toHaveProperty("tokens");

    expect(result).toEqual({ created: 1, updated: 1, failed: 0 });
  });

  test("skips paramSet when the backup device has no params", async () => {
    readBackupFileMock.mockReturnValue([{ id: "dev-new", name: "Bare", network: "n", connector: "c" }]);

    const createMock = vi.fn().mockResolvedValue({ device_id: "dev-new-generated" });
    const paramSetMock = vi.fn();
    const resources = {
      devices: { list: vi.fn().mockResolvedValue([]), create: createMock, edit: vi.fn(), paramSet: paramSetMock },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    await promise;

    expect(paramSetMock).not.toHaveBeenCalled();
  });

  test("edit path skips backup params whose key already exists on the device", async () => {
    // Backup has 3 params; the destination device already has 2 of them
    // (by key). Expectation: only the brand-new key is sent to paramSet.
    // Existing keys are left untouched — destination values win, matching
    // the token restore behavior (no overwrite). Without this filter every
    // re-run would duplicate the matching params.
    readBackupFileMock.mockReturnValue([
      {
        id: "dev-exists",
        name: "Dev",
        network: "n",
        connector: "c",
        params: [
          { key: "k_keep", value: "new_keep", sent: false },
          { key: "k_update", value: "new_update", sent: true },
          { key: "k_fresh", value: "fresh_val", sent: false },
        ],
      },
    ]);

    const listMock = vi.fn().mockResolvedValue([{ id: "dev-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const paramSetMock = vi.fn().mockResolvedValue(undefined);
    // Destination already has params for k_keep and k_update. k_fresh is
    // not yet present and is the only one that will be inserted.
    const paramListMock = vi.fn().mockResolvedValue([
      { id: "dst-1", key: "k_keep", value: "old_keep", sent: false },
      { id: "dst-2", key: "k_update", value: "old_update", sent: false },
      { id: "dst-3", key: "unrelated", value: "keep_me", sent: false },
    ]);

    const resources = {
      devices: {
        list: listMock,
        create: vi.fn(),
        edit: editMock,
        paramSet: paramSetMock,
        paramList: paramListMock,
        tokenList: vi.fn().mockResolvedValue([]),
      },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(paramListMock).toHaveBeenCalledWith("dev-exists");
    expect(paramSetMock).toHaveBeenCalledTimes(1);
    expect(paramSetMock).toHaveBeenCalledWith("dev-exists", [{ key: "k_fresh", value: "fresh_val", sent: false }]);
    expect(result).toEqual({ created: 0, updated: 1, failed: 0 });
  });

  test("edit path skips paramSet entirely when every backup key is already on the device", async () => {
    // All backup keys are already present on the destination → nothing to
    // insert. paramSet should not be called at all, and the restore must
    // still complete successfully.
    readBackupFileMock.mockReturnValue([
      {
        id: "dev-exists",
        name: "Dev",
        network: "n",
        connector: "c",
        params: [
          { key: "k1", value: "new1", sent: false },
          { key: "k2", value: "new2", sent: false },
        ],
      },
    ]);

    const paramSetMock = vi.fn();
    const paramListMock = vi.fn().mockResolvedValue([
      { id: "dst-1", key: "k1", value: "old1", sent: false },
      { id: "dst-2", key: "k2", value: "old2", sent: false },
    ]);

    const resources = {
      devices: {
        list: vi.fn().mockResolvedValue([{ id: "dev-exists" }]),
        create: vi.fn(),
        edit: vi.fn().mockResolvedValue(undefined),
        paramSet: paramSetMock,
        paramList: paramListMock,
        tokenList: vi.fn().mockResolvedValue([]),
      },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(paramListMock).toHaveBeenCalledWith("dev-exists");
    expect(paramSetMock).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 1, failed: 0 });
  });

  test("edit path skips tokens whose serie_number already exists on the device", async () => {
    readBackupFileMock.mockReturnValue([
      {
        id: "dev-exists",
        name: "Dev",
        network: "n",
        connector: "c",
        tokens: [
          // Already on the device → should be skipped to avoid
          // "serial_number already exists" from the API.
          { token: "********-a", name: "Already Here", permission: "full", serie_number: "SN-KEEP", expire_time: null },
          // Not on the device → should be (re)created.
          { token: "********-b", name: "Brand New", permission: "full", serie_number: "SN-NEW", expire_time: null },
        ],
      },
    ]);

    // Device already exists in the destination profile → edit path.
    const listMock = vi.fn().mockResolvedValue([{ id: "dev-exists" }]);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const tokenCreateMock = vi.fn().mockResolvedValue(undefined);
    // tokenList returns a token with SN-KEEP — the backup's SN-KEEP should be skipped.
    const tokenListMock = vi.fn().mockResolvedValue([
      { serie_number: "SN-KEEP" },
      { serie_number: null }, // defensive: tokens without serial shouldn't affect the filter
    ]);

    const resources = {
      devices: {
        list: listMock,
        create: vi.fn(),
        edit: editMock,
        paramSet: vi.fn(),
        tokenCreate: tokenCreateMock,
        tokenList: tokenListMock,
      },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    // tokenList is queried once per device on the edit path
    expect(tokenListMock).toHaveBeenCalledWith("dev-exists", expect.objectContaining({ fields: ["serie_number"] }));

    // Only SN-NEW is created; SN-KEEP is skipped because it's already on the device.
    expect(tokenCreateMock).toHaveBeenCalledTimes(1);
    expect(tokenCreateMock).toHaveBeenCalledWith("dev-exists", expect.objectContaining({ serie_number: "SN-NEW", name: "Brand New" }));

    expect(result).toEqual({ created: 0, updated: 1, failed: 0 });
  });

  test("create path skips tokenList and creates every token with a serie_number directly", async () => {
    readBackupFileMock.mockReturnValue([
      {
        id: "dev-new",
        name: "Dev",
        network: "n",
        connector: "c",
        tokens: [{ token: "********-a", name: "T1", permission: "full", serie_number: "SN-1", expire_time: null }],
      },
    ]);

    const createMock = vi.fn().mockResolvedValue({ device_id: "dev-new-generated" });
    const tokenCreateMock = vi.fn().mockResolvedValue(undefined);
    const tokenListMock = vi.fn();

    const resources = {
      devices: {
        list: vi.fn().mockResolvedValue([]),
        create: createMock,
        edit: vi.fn(),
        paramSet: vi.fn(),
        tokenCreate: tokenCreateMock,
        tokenList: tokenListMock,
      },
    };

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    await promise;

    // Brand-new device → no existing tokens possible → skip the tokenList call.
    expect(tokenListMock).not.toHaveBeenCalled();
    expect(tokenCreateMock).toHaveBeenCalledWith("dev-new-generated", expect.objectContaining({ serie_number: "SN-1" }));
  });

  test("recreates tokens with serie_number, skips those without, and tolerates per-token failures", async () => {
    readBackupFileMock.mockReturnValue([
      {
        id: "dev-new",
        name: "Dev",
        network: "n",
        connector: "c",
        tokens: [
          // Kept — has a serie_number
          { token: "********-a", name: "Serial Token", permission: "full", serie_number: "SN-1", expire_time: null, created_at: "2026-01-01T00:00:00Z" },
          // Skipped — no serie_number (ephemeral credential)
          { token: "********-b", name: "Ephemeral", permission: "read", serie_number: null, expire_time: null, created_at: "2026-01-01T00:00:00Z" },
          // Kept — failure on this one should not abort the next token
          { token: "********-c", name: "Boom", permission: "full", serie_number: "SN-2", expire_time: null, created_at: "2026-01-01T00:00:00Z" },
          // Kept — should still run even after the failure above
          { token: "********-d", name: "Survivor", permission: "full", serie_number: "SN-3", expire_time: null, created_at: "2026-01-01T00:00:00Z" },
        ],
      },
    ]);

    const createMock = vi.fn().mockResolvedValue({ device_id: "dev-new-generated" });
    const tokenCreateMock = vi
      .fn()
      // First token: ok
      .mockResolvedValueOnce(undefined)
      // Second kept token: throws — but the loop continues
      .mockRejectedValueOnce(new Error("token create failed"))
      // Third kept token: ok
      .mockResolvedValueOnce(undefined);

    const resources = {
      devices: {
        list: vi.fn().mockResolvedValue([]),
        create: createMock,
        edit: vi.fn(),
        paramSet: vi.fn(),
        tokenCreate: tokenCreateMock,
      },
    };

    // Silence the per-token error log so it doesn't pollute test output
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { restoreDevices } = await import("./devices.js");
    const promise = restoreDevices(resources as never, "/tmp/extract");
    await vi.runAllTimersAsync();
    const result = await promise;

    // 3 of the 4 tokens have a serie_number → 3 calls; the second one rejected.
    expect(tokenCreateMock).toHaveBeenCalledTimes(3);

    // Payload is trimmed to what tokenCreate accepts — masked `token` and
    // `created_at` from the backup are dropped.
    expect(tokenCreateMock).toHaveBeenNthCalledWith(1, "dev-new-generated", {
      name: "Serial Token",
      permission: "full",
      serie_number: "SN-1",
      expire_time: undefined,
    });
    expect(tokenCreateMock).toHaveBeenNthCalledWith(3, "dev-new-generated", {
      name: "Survivor",
      permission: "full",
      serie_number: "SN-3",
      expire_time: undefined,
    });

    // Device creation is still counted as successful despite the failed token —
    // token failures are logged, not fatal.
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to recreate token "Boom"'));
    errSpy.mockRestore();
  });
});
