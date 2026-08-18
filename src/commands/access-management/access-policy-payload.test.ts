import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});
const existsSyncMock = vi.fn(() => true);
const readFileSyncMock = vi.fn(() => "[]");

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

const PERMISSION = { effect: "allow", action: ["access"], resource: ["device"] };

describe("access policy payload", () => {
  beforeEach(() => {
    errorHandlerMock.mockClear();
    errorHandlerJSONMock.mockClear();
    existsSyncMock.mockReset().mockReturnValue(true);
    readFileSyncMock.mockReset().mockReturnValue("[]");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolvePermissions", () => {
    test("parses inline JSON into the permission array", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(resolvePermissions({ permissions: JSON.stringify([PERMISSION]) })).toEqual([PERMISSION]);
    });

    test("reads the same content from a file", async () => {
      readFileSyncMock.mockReturnValue(JSON.stringify([PERMISSION]));

      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(resolvePermissions({ permissionsFile: "perms.json" })).toEqual([PERMISSION]);
      expect(readFileSyncMock).toHaveBeenCalledWith("perms.json", "utf8");
    });

    /**
     * `entity-create.ts` reads a user path with a bare `readFileSync`, so a
     * wrong path escapes as an unhandled ENOENT with a stack trace.
     * `language-content.ts` guards with `existsSync` first; this follows that.
     */
    test("a missing file reports the path rather than an ENOENT stack trace", async () => {
      existsSyncMock.mockReturnValue(false);

      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(() => resolvePermissions({ permissionsFile: "nope.json" })).toThrow(/file_not_found/);
      expect(() => resolvePermissions({ permissionsFile: "nope.json" })).toThrow(/nope\.json/);
      expect(readFileSyncMock).not.toHaveBeenCalled();
    });

    test("malformed JSON names the flag, not a bare SyntaxError", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(() => resolvePermissions({ permissions: "{not json" })).toThrow(/--permissions/);
    });

    test("a JSON object rather than an array is rejected", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(() => resolvePermissions({ permissions: JSON.stringify(PERMISSION) })).toThrow(/array/i);
    });

    /** Probed: the API rejects anything but allow|deny with an enum error. */
    test("an invalid effect fails offline, naming both valid values", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");
      const bad = JSON.stringify([{ ...PERMISSION, effect: "maybe" }]);

      expect(() => resolvePermissions({ permissions: bad })).toThrow(/invalid_effect/);
      expect(() => resolvePermissions({ permissions: bad })).toThrow(/allow/);
      expect(() => resolvePermissions({ permissions: bad })).toThrow(/deny/);
    });

    test("deny is accepted", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");
      const deny = [{ ...PERMISSION, effect: "deny" }];

      expect(resolvePermissions({ permissions: JSON.stringify(deny) })).toEqual(deny);
    });

    /**
     * The deliberate inversion of #47, where eight runtimes were validated
     * offline. The API's rejection lists all 37 actions and 21 resources, which
     * beats any list the CLI could freeze — and a frozen list would refuse a
     * value the platform adds after this ships.
     */
    test("an unknown action is forwarded, not rejected", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");
      const exotic = [{ effect: "allow", action: ["some_future_action"], resource: ["device"] }];

      expect(resolvePermissions({ permissions: JSON.stringify(exotic) })).toEqual(exotic);
    });

    test("an unknown resource is forwarded, not rejected", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");
      const exotic = [{ effect: "allow", action: ["access"], resource: ["some_future_resource"] }];

      expect(resolvePermissions({ permissions: JSON.stringify(exotic) })).toEqual(exotic);
    });

    test("a permission missing effect fails offline naming the field", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");
      const bad = JSON.stringify([{ action: ["access"], resource: ["device"] }]);

      expect(() => resolvePermissions({ permissions: bad })).toThrow(/effect/);
    });

    test("a permission missing action fails offline naming the field", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");
      const bad = JSON.stringify([{ effect: "allow", resource: ["device"] }]);

      expect(() => resolvePermissions({ permissions: bad })).toThrow(/action/);
    });

    test("a permission whose action is not an array fails offline", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");
      const bad = JSON.stringify([{ effect: "allow", action: "access", resource: ["device"] }]);

      expect(() => resolvePermissions({ permissions: bad })).toThrow(/action/);
    });

    test("the flag and its file twin together fail offline", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(() => resolvePermissions({ permissions: JSON.stringify([PERMISSION]), permissionsFile: "perms.json" })).toThrow(/conflicting_flags/);
    });

    /** The caller decides whether it was required, so absence is not an error here. */
    test("neither flag yields undefined", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(resolvePermissions({})).toBeUndefined();
    });

    test("the rejection routes through the JSON channel when --json is set", async () => {
      const { resolvePermissions } = await import("./access-policy-payload.js");

      expect(() => resolvePermissions({ permissions: "{not json", json: true })).toThrow(/^json:/);
    });
  });

  describe("resolveTargets", () => {
    test("parses inline JSON into the target array", async () => {
      const { resolveTargets } = await import("./access-policy-payload.js");
      const targets = [["analysis", "id", "ana1"]];

      expect(resolveTargets({ targets: JSON.stringify(targets) })).toEqual(targets);
    });

    /** Probed: a target is a triple, not the `[]` literal the SDK type declares. */
    test("a tag_match target is accepted", async () => {
      const { resolveTargets } = await import("./access-policy-payload.js");
      const targets = [["run_user", "tag_match", "organization_id"]];

      expect(resolveTargets({ targets: JSON.stringify(targets) })).toEqual(targets);
    });

    test("reads targets from a file", async () => {
      readFileSyncMock.mockReturnValue(JSON.stringify([["analysis", "id", "ana1"]]));

      const { resolveTargets } = await import("./access-policy-payload.js");

      expect(resolveTargets({ targetsFile: "targets.json" })).toEqual([["analysis", "id", "ana1"]]);
    });

    /** Probed: the API answers `Array must contain at least 1 element(s)`. */
    test("an empty target list fails offline", async () => {
      const { resolveTargets } = await import("./access-policy-payload.js");

      expect(() => resolveTargets({ targets: "[]" })).toThrow(/empty_targets/);
    });

    test("a target that is not an array fails offline", async () => {
      const { resolveTargets } = await import("./access-policy-payload.js");

      expect(() => resolveTargets({ targets: JSON.stringify(["analysis"]) })).toThrow(/invalid_target/);
    });

    test("a missing targets file reports the path", async () => {
      existsSyncMock.mockReturnValue(false);

      const { resolveTargets } = await import("./access-policy-payload.js");

      expect(() => resolveTargets({ targetsFile: "nope.json" })).toThrow(/file_not_found/);
    });

    test("the flag and its file twin together fail offline", async () => {
      const { resolveTargets } = await import("./access-policy-payload.js");

      expect(() => resolveTargets({ targets: "[]", targetsFile: "t.json" })).toThrow(/conflicting_flags/);
    });

    test("neither flag yields undefined", async () => {
      const { resolveTargets } = await import("./access-policy-payload.js");

      expect(resolveTargets({})).toBeUndefined();
    });
  });
});
