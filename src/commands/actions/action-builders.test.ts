import { describe, expect, test, vi } from "vitest";

/**
 * Deviation from the "pure functions, no mocks" convention of
 * `src/lib/commander-repeatable.test.ts`: the builders signal failures through
 * `errorHandler` / `errorHandlerJSON`, which call `process.exit(1)`. Mocking
 * `messages.js` so they throw instead is what makes the failure paths
 * assertable. Nothing else is mocked — no SDK, no config, no prompts.
 */
const errorHandlerMock = vi.fn((str: unknown) => {
  throw new Error(String(str));
});
const errorHandlerJSONMock = vi.fn((message: string, code?: string) => {
  throw new Error(`json:${code}:${message}`);
});

vi.mock("../../lib/messages.js", () => ({
  errorHandler: errorHandlerMock,
  errorHandlerJSON: errorHandlerJSONMock,
}));

const { buildActionTarget, buildTrigger, inferValueType, parseHeaders, parseJSONFlag } = await import("./action-builders.js");

describe("inferValueType", () => {
  test("infers number for numeric strings", () => {
    expect(inferValueType("30")).toBe("number");
    expect(inferValueType("0")).toBe("number");
    expect(inferValueType("-4.5")).toBe("number");
  });

  test("infers string for non-numeric values", () => {
    expect(inferValueType("open")).toBe("string");
    expect(inferValueType("")).toBe("string");
  });

  // Deliberate: "true" stays a string. Inferring boolean would surprise anyone
  // with a literal "true" string variable, and the failure mode is silent —
  // the action simply never fires.
  test("infers string for boolean-looking values", () => {
    expect(inferValueType("true")).toBe("string");
    expect(inferValueType("false")).toBe("string");
  });

  test("an explicit type always wins over inference", () => {
    expect(inferValueType("30", "string")).toBe("string");
    expect(inferValueType("open", "boolean")).toBe("boolean");
    expect(inferValueType("30", "*")).toBe("*");
  });
});

describe("parseHeaders", () => {
  test("splits each pair on the first = only", () => {
    expect(parseHeaders(["Authorization=Bearer a=b"])).toEqual({ Authorization: "Bearer a=b" });
  });

  test("accumulates multiple pairs", () => {
    expect(parseHeaders(["a=1", "b=2"])).toEqual({ a: "1", b: "2" });
  });

  test("returns an empty object for no pairs", () => {
    expect(parseHeaders([])).toEqual({});
    expect(parseHeaders(undefined)).toEqual({});
  });

  test("rejects a pair with no = rather than coercing to an empty value", () => {
    expect(() => parseHeaders(["novalue"])).toThrow(/invalid_header/);
  });

  test("rejects a pair with an empty key", () => {
    expect(() => parseHeaders(["=1"])).toThrow(/invalid_header/);
  });
});

describe("parseJSONFlag", () => {
  test("parses a valid array for an array-kind flag", () => {
    expect(parseJSONFlag('[{"a":1}]', "--trigger-json", "array")).toEqual([{ a: 1 }]);
  });

  test("parses a valid object for an object-kind flag", () => {
    expect(parseJSONFlag('{"type":"script"}', "--action-json", "object")).toEqual({ type: "script" });
  });

  test("names the offending flag instead of surfacing a raw SyntaxError", () => {
    expect(() => parseJSONFlag("{", "--trigger-json", "array")).toThrow(/--trigger-json/);
    expect(() => parseJSONFlag("{", "--trigger-json", "array")).not.toThrow(/SyntaxError/);
  });

  test("rejects an object where an array is required", () => {
    expect(() => parseJSONFlag('{"a":1}', "--trigger-json", "array")).toThrow(/invalid_json/);
  });

  test("rejects an array where an object is required", () => {
    expect(() => parseJSONFlag("[1,2]", "--action-json", "object")).toThrow(/invalid_json/);
  });

  // typeof null === "object", so a naive check lets null through.
  test("rejects null for an object-kind flag", () => {
    expect(() => parseJSONFlag("null", "--action-json", "object")).toThrow(/invalid_json/);
  });
});

describe("buildTrigger — shape per trigger type", () => {
  test("condition builds a device/variable comparison", () => {
    expect(
      buildTrigger("condition", {
        triggerDevice: "dev1",
        triggerVariable: "temperature",
        triggerIs: ">",
        triggerValue: "30",
      }),
    ).toEqual([{ device: "dev1", variable: "temperature", is: ">", value: "30", value_type: "number" }]);
  });

  test("condition accepts every Conditionals operator", () => {
    for (const is of ["<", ">", "=", "!", "><", "*"]) {
      const [trigger] = buildTrigger("condition", {
        triggerDevice: "dev1",
        triggerVariable: "v",
        triggerIs: is,
        triggerValue: "1",
      });
      expect(trigger).toMatchObject({ is });
    }
  });

  test("condition rejects an unknown operator", () => {
    expect(() => buildTrigger("condition", { triggerDevice: "dev1", triggerVariable: "v", triggerIs: ">=", triggerValue: "1" })).toThrow(/invalid_conditional/);
  });

  test("schedule builds cron + timezone", () => {
    expect(buildTrigger("schedule", { cron: "0 9 * * *", timezone: "UTC" })).toEqual([{ cron: "0 9 * * *", timezone: "UTC" }]);
  });

  test("interval builds an interval", () => {
    expect(buildTrigger("interval", { interval: "1 hour" })).toEqual([{ interval: "1 hour" }]);
  });

  test("resource builds resource/when/tag pair", () => {
    expect(buildTrigger("resource", { resource: "device", when: "create", resourceTagKey: "type", resourceTagValue: "sensor" })).toEqual([
      { resource: "device", when: "create", tag_key: "type", tag_value: "sensor" },
    ]);
  });

  test("usage_alert coerces condition_value to a number", () => {
    const [trigger] = buildTrigger("usage_alert", { service: "input", condition: ">", conditionValue: 90 });
    expect(trigger).toEqual({ service_or_resource: "input", condition: ">", condition_value: 90 });
    expect(typeof (trigger as { condition_value: unknown }).condition_value).toBe("number");
  });

  test("always returns an array", () => {
    expect(Array.isArray(buildTrigger("interval", { interval: "1 hour" }))).toBe(true);
  });

  test("an unknown trigger type is rejected and lists the valid set", () => {
    expect(() => buildTrigger("bogus" as never, {})).toThrow(/invalid_trigger_type/);
    expect(() => buildTrigger("bogus" as never, {})).toThrow(/condition/);
  });
});

describe("buildTrigger — required field validation", () => {
  test("condition without a device fails naming the flag", () => {
    expect(() => buildTrigger("condition", { triggerVariable: "v", triggerIs: ">", triggerValue: "1" })).toThrow(/--trigger-device/);
  });

  test("condition without a variable fails", () => {
    expect(() => buildTrigger("condition", { triggerDevice: "d", triggerIs: ">", triggerValue: "1" })).toThrow(/--trigger-variable/);
  });

  test("schedule without a cron fails", () => {
    expect(() => buildTrigger("schedule", { timezone: "UTC" })).toThrow(/--cron/);
  });

  test("interval without a value fails", () => {
    expect(() => buildTrigger("interval", {})).toThrow(/--interval/);
  });

  test("resource without a when fails", () => {
    expect(() => buildTrigger("resource", { resource: "device" })).toThrow(/--when/);
  });

  test("usage_alert without a condition-value fails", () => {
    expect(() => buildTrigger("usage_alert", { service: "input", condition: ">" })).toThrow(/--condition-value/);
  });

  test("mqtt_topic without a topic fails naming the flag", () => {
    expect(() => buildTrigger("mqtt_topic", {})).toThrow(/--topic/);
  });

  test("mqtt_topic without a tag key fails", () => {
    expect(() => buildTrigger("mqtt_topic", { topic: "/device/#" })).toThrow(/--trigger-tag-key/);
  });

  test("mqtt_topic without a tag value fails", () => {
    expect(() => buildTrigger("mqtt_topic", { topic: "/device/#", triggerTagKey: "foo" })).toThrow(/--trigger-tag-value/);
  });

  // condition_geofence keeps no typed flags: its `value` is a nested geometry
  // object (center+radius or a coordinate ring) that does not map onto flat flags.
  test("condition_geofence without --trigger-json fails naming that flag", () => {
    expect(() => buildTrigger("condition_geofence", {})).toThrow(/--trigger-json/);
  });
});

/**
 * These three rules are not in the SDK types or any documentation — they are
 * encoded in `src/commands/profile/export/services/actions-export.ts:30-40`,
 * where the export path learned them against the live API. Asserted with the
 * `in` operator rather than `toBeUndefined()`, because a key present with an
 * undefined value would satisfy the latter while still being serialized.
 */
/**
 * The API requires topic + tag_key + tag_value on an mqtt_topic trigger; `name`
 * is optional. Verified against the live API — `{topic}` alone is rejected with
 * "Required" on trigger[0].
 */
describe("buildTrigger — mqtt_topic", () => {
  test("builds topic with its required tag pair", () => {
    expect(buildTrigger("mqtt_topic", { topic: "/device/#", triggerTagKey: "foo", triggerTagValue: "bar" })).toEqual([
      { topic: "/device/#", tag_key: "foo", tag_value: "bar" },
    ]);
  });

  // The web UI sends a `name` on this trigger, but the API drops it — verified
  // by creating an action with `name` through --trigger-json and reading it
  // back without one. No flag is exposed, so nothing emits it.
  test("never emits a name, which the API discards anyway", () => {
    const [trigger] = buildTrigger("mqtt_topic", { topic: "/device/#", triggerTagKey: "foo", triggerTagValue: "bar" });
    expect("name" in trigger).toBe(false);
  });

  test("--trigger-json still overrides the typed flags", () => {
    expect(buildTrigger("mqtt_topic", { triggerJson: '[{"topic":"/x/#","tag_key":"a","tag_value":"b"}]' })).toEqual([
      { topic: "/x/#", tag_key: "a", tag_value: "b" },
    ]);
  });

  test("typed topic flag combined with --trigger-json is rejected", () => {
    expect(() => buildTrigger("mqtt_topic", { topic: "/a/#", triggerJson: "[]" })).toThrow(/conflicting_trigger_input/);
  });
});

describe("buildTrigger — API normalization rules", () => {
  test("an empty value omits the key entirely", () => {
    const [trigger] = buildTrigger("condition", {
      triggerDevice: "dev1",
      triggerVariable: "v",
      triggerIs: "*",
      triggerValue: "",
    });
    expect("value" in trigger).toBe(false);
  });

  test("an omitted second_value omits the key entirely", () => {
    const [trigger] = buildTrigger("condition", {
      triggerDevice: "dev1",
      triggerVariable: "v",
      triggerIs: ">",
      triggerValue: "1",
    });
    expect("second_value" in trigger).toBe(false);
  });

  test("an empty second_value omits the key entirely", () => {
    const [trigger] = buildTrigger("condition", {
      triggerDevice: "dev1",
      triggerVariable: "v",
      triggerIs: "><",
      triggerValue: "1",
      triggerSecondValue: "",
    });
    expect("second_value" in trigger).toBe(false);
  });

  test("a populated second_value is kept", () => {
    const [trigger] = buildTrigger("condition", {
      triggerDevice: "dev1",
      triggerVariable: "v",
      triggerIs: "><",
      triggerValue: "1",
      triggerSecondValue: "9",
    });
    expect(trigger).toMatchObject({ second_value: "9" });
  });

  test("a resource trigger never carries unlock, even when requested", () => {
    const [trigger] = buildTrigger("resource", {
      resource: "device",
      when: "create",
      resourceTagKey: "type",
      resourceTagValue: "sensor",
      triggerUnlock: true,
    });
    expect("unlock" in trigger).toBe(false);
  });

  /**
   * `unlock` marks a trigger as the *unlock condition* — the rule that re-arms
   * the action — not as a firing trigger. An action whose only trigger carries
   * unlock:true has no firing condition at all, and the web UI renders its
   * variable/value row empty. Rejecting it offline beats creating a broken
   * action the API happily accepts.
   */
  test("--trigger-unlock alone is rejected, since it would leave no firing trigger", () => {
    expect(() =>
      buildTrigger("condition", {
        triggerDevice: "dev1",
        triggerVariable: "v",
        triggerIs: ">",
        triggerValue: "1",
        triggerUnlock: true,
      }),
    ).toThrow(/unlock_without_trigger/);
  });

  test("the rejection points at --trigger-json as the way to build an unlock pair", () => {
    expect(() => buildTrigger("condition", { triggerDevice: "dev1", triggerVariable: "v", triggerIs: ">", triggerValue: "1", triggerUnlock: true })).toThrow(
      /--trigger-json/,
    );
  });

  test("a condition trigger omits unlock when not requested", () => {
    const [trigger] = buildTrigger("condition", {
      triggerDevice: "dev1",
      triggerVariable: "v",
      triggerIs: ">",
      triggerValue: "1",
    });
    expect("unlock" in trigger).toBe(false);
  });
});

describe("buildTrigger — --trigger-json escape hatch", () => {
  test("uses the raw JSON when given", () => {
    expect(buildTrigger("mqtt_topic", { triggerJson: '[{"topic":"a/b"}]' })).toEqual([{ topic: "a/b" }]);
  });

  test("typed flags combined with --trigger-json are rejected", () => {
    expect(() =>
      buildTrigger("condition", {
        triggerDevice: "dev1",
        triggerVariable: "v",
        triggerIs: ">",
        triggerValue: "1",
        triggerJson: "[]",
      }),
    ).toThrow(/conflicting_trigger_input/);
  });
});

describe("buildActionTarget", () => {
  test("--run-script accumulates repeated ids", () => {
    expect(buildActionTarget({ runScript: ["a", "b"] })).toEqual({ type: "script", script: ["a", "b"] });
  });

  test("--notification builds subject + message", () => {
    expect(buildActionTarget({ notification: true, subject: "S", message: "M" })).toEqual({
      type: "notification",
      subject: "S",
      message: "M",
    });
  });

  test("--email builds to + subject + message", () => {
    expect(buildActionTarget({ email: "a@b.com", subject: "S", message: "M" })).toEqual({
      type: "email",
      to: "a@b.com",
      subject: "S",
      message: "M",
    });
  });

  test("--post builds url + parsed headers", () => {
    expect(buildActionTarget({ post: "https://x.dev/hook", header: ["a=1"] })).toEqual({
      type: "post",
      url: "https://x.dev/hook",
      headers: { a: "1" },
    });
  });

  test("--post without headers still sends an empty headers object", () => {
    expect(buildActionTarget({ post: "https://x.dev/hook" })).toEqual({
      type: "post",
      url: "https://x.dev/hook",
      headers: {},
    });
  });

  test("--action-json passes through verbatim", () => {
    const raw = '{"type":"queue-sqs","sqs_secret":"s1","batch_enabled":true}';
    expect(buildActionTarget({ actionJson: raw })).toEqual({ type: "queue-sqs", sqs_secret: "s1", batch_enabled: true });
  });

  test("--notification without a subject fails", () => {
    expect(() => buildActionTarget({ notification: true, message: "M" })).toThrow(/--subject/);
  });

  test("--email without a message fails", () => {
    expect(() => buildActionTarget({ email: "a@b.com", subject: "S" })).toThrow(/--message/);
  });

  test("no target at all fails", () => {
    expect(() => buildActionTarget({})).toThrow(/missing_action/);
  });

  test("an empty --run-script array counts as no target", () => {
    expect(() => buildActionTarget({ runScript: [] })).toThrow(/missing_action/);
  });

  test("two targets fail", () => {
    expect(() => buildActionTarget({ runScript: ["a"], notification: true, subject: "S", message: "M" })).toThrow(/conflicting_action/);
  });

  test("a typed target combined with --action-json fails", () => {
    expect(() => buildActionTarget({ runScript: ["a"], actionJson: "{}" })).toThrow(/conflicting_action/);
  });
});

describe("error channel", () => {
  test("routes through errorHandlerJSON when json is set", () => {
    errorHandlerJSONMock.mockClear();
    expect(() => buildActionTarget({ json: true })).toThrow(/^json:missing_action:/);
    expect(errorHandlerJSONMock).toHaveBeenCalledWith(expect.any(String), "missing_action");
  });

  test("routes through errorHandler when json is not set", () => {
    errorHandlerMock.mockClear();
    expect(() => buildActionTarget({})).toThrow();
    expect(errorHandlerMock).toHaveBeenCalled();
  });
});
