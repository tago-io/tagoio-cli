import type { ActionCreateInfo } from "@tago-io/sdk";

import { errorHandler, errorHandlerJSON } from "../../lib/messages.js";

// The SDK exports `ActionCreateInfo` but not the `ActionTypeParams` /
// `ActionTriggerType` unions it is built from, so derive them from the parent
// rather than reaching into the package's internal module paths.
type ActionTypeParams = ActionCreateInfo["action"];
type ActionTriggerType = NonNullable<ActionCreateInfo["trigger"]>[number];

/** Trigger families the API accepts, in `ActionCreateInfo.type`. */
const ACTION_TYPES = ["condition", "resource", "interval", "schedule", "mqtt_topic", "usage_alert", "condition_geofence"] as const;
type ActionTypeName = (typeof ACTION_TYPES)[number];

/** Comparison operators valid on a condition trigger (`Conditionals` in the SDK). */
const CONDITIONALS = ["<", ">", "=", "!", "><", "*"] as const;

/**
 * Trigger families with no typed-flag support; `--trigger-json` is the only path.
 * `condition_geofence` qualifies because its `value` is a nested geometry object
 * (center + radius, or a ring of coordinates) that does not map onto flat flags.
 */
const JSON_ONLY_TYPES = new Set<ActionTypeName>(["condition_geofence"]);

type ValueType = "string" | "number" | "boolean" | "*";

/**
 * Every flag the builders read. Commander hands these over camel-cased; the
 * `json` flag only selects the error channel.
 */
interface BuilderOptions {
  json?: boolean;
  // condition
  triggerDevice?: string;
  triggerVariable?: string;
  triggerIs?: string;
  triggerValue?: string;
  triggerSecondValue?: string;
  triggerValueType?: ValueType;
  triggerUnlock?: boolean;
  // schedule / interval
  cron?: string;
  timezone?: string;
  interval?: string;
  // resource
  resource?: string;
  when?: string;
  resourceTagKey?: string;
  resourceTagValue?: string;
  // usage_alert
  service?: string;
  condition?: string;
  conditionValue?: number;
  // mqtt_topic
  topic?: string;
  triggerTagKey?: string;
  triggerTagValue?: string;
  // escape hatch
  triggerJson?: string;
  // targets
  runScript?: string[];
  notification?: boolean;
  email?: string;
  subject?: string;
  message?: string;
  post?: string;
  header?: string[];
  actionJson?: string;
}

/**
 * @description Fails through the same two-channel convention every command
 * file uses: a JSON object on stderr when `--json` was passed, `[ERROR] ...`
 * otherwise. Both exit non-zero, so the return type is `never`.
 */
function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * @description Returns `value` when present, otherwise fails naming the CLI
 * flag the caller omitted — an actionable message beats a generic API error.
 */
function requireFlag<T>(value: T | undefined, flag: string, options: BuilderOptions): T {
  if (value === undefined || value === "") {
    failWith(`Missing required flag ${flag} for this trigger type.`, "missing_trigger_field", options.json);
  }
  return value;
}

/**
 * @description Picks the `value_type` sent alongside a condition trigger.
 * An explicit `--trigger-value-type` always wins; otherwise a numeric-looking
 * value infers `number` and everything else infers `string`.
 *
 * Boolean-looking values stay `string` on purpose: a literal "true" variable is
 * common, and guessing wrong produces an action that silently never fires.
 */
function inferValueType(value: string, explicit?: ValueType): ValueType {
  if (explicit) {
    return explicit;
  }
  if (value !== "" && !Number.isNaN(Number(value))) {
    return "number";
  }
  return "string";
}

/**
 * @description Turns repeatable `--header k=v` pairs into a headers object,
 * splitting on the first `=` so values may themselves contain `=`.
 */
function parseHeaders(pairs?: string[], options: BuilderOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const separator = pair.indexOf("=");
    if (separator < 1) {
      failWith(`Invalid --header "${pair}". Expected the form key=value.`, "invalid_header", options.json);
    }
    headers[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return headers;
}

/**
 * @description Parses a JSON-valued flag, reporting the flag name rather than
 * a bare SyntaxError, and enforcing the shape the API expects for that field.
 */
function parseJSONFlag(raw: string, flag: string, kind: "array" | "object", options: BuilderOptions = {}): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    failWith(`${flag} is not valid JSON.`, "invalid_json", options.json);
  }

  const isArray = Array.isArray(parsed);
  // `typeof null === "object"`, so null must be excluded explicitly.
  const isObject = typeof parsed === "object" && parsed !== null && !isArray;

  if (kind === "array" && !isArray) {
    failWith(`${flag} must be a JSON array.`, "invalid_json", options.json);
  }
  if (kind === "object" && !isObject) {
    failWith(`${flag} must be a JSON object.`, "invalid_json", options.json);
  }

  return parsed;
}

/**
 * @description Assembles a condition trigger.
 *
 * The `as` cast below is deliberate. The SDK types `value` as required on this
 * union member, but the API rejects an empty string and expects the key to be
 * absent instead — see `src/commands/profile/export/services/actions-export.ts:30-40`,
 * where the export path encodes the same rule. Emitting `value: ""` to satisfy
 * the type would produce an action the API refuses.
 */
function buildConditionTrigger(options: BuilderOptions) {
  const device = requireFlag(options.triggerDevice, "--trigger-device", options);
  const variable = requireFlag(options.triggerVariable, "--trigger-variable", options);
  const is = requireFlag(options.triggerIs, "--trigger-is", options);

  if (!CONDITIONALS.includes(is as (typeof CONDITIONALS)[number])) {
    failWith(`Invalid --trigger-is "${is}". Valid operators: ${CONDITIONALS.join(" ")}.`, "invalid_conditional", options.json);
  }

  // `unlock` marks a trigger as the condition that re-arms the action, not as a
  // firing condition. Setting it on the only trigger leaves the action with
  // nothing to fire on: the API accepts it, but the web UI then renders an
  // empty variable/value row. An unlock pair needs two triggers, which the
  // typed flags cannot express — so point at --trigger-json instead.
  if (options.triggerUnlock) {
    failWith(
      '--trigger-unlock marks a trigger as the unlock condition, so it cannot be the only trigger. Build the pair with --trigger-json: one entry without unlock to fire, one with "unlock": true to re-arm.',
      "unlock_without_trigger",
      options.json,
    );
  }

  const value = options.triggerValue ?? "";
  return {
    device,
    variable,
    is,
    // Omit empty value / second_value entirely (API constraint).
    ...(value ? { value } : {}),
    ...(options.triggerSecondValue ? { second_value: options.triggerSecondValue } : {}),
    value_type: inferValueType(value, options.triggerValueType),
  } as ActionTriggerType;
}

/** @description Assembles a resource trigger. `unlock` is never emitted here — the API rejects it on tag_key triggers. */
function buildResourceTrigger(options: BuilderOptions) {
  return {
    resource: requireFlag(options.resource, "--resource", options),
    when: requireFlag(options.when, "--when", options),
    tag_key: requireFlag(options.resourceTagKey, "--resource-tag-key", options),
    tag_value: requireFlag(options.resourceTagValue, "--resource-tag-value", options),
  } as ActionTriggerType;
}

/**
 * @description Assembles an mqtt_topic trigger.
 *
 * The API requires `topic`, `tag_key` and `tag_value` together — a trigger
 * carrying only `topic` is rejected with "Required" on `trigger[0]`.
 *
 * The web UI also sends a `name` field, but the API discards it: an action
 * created with `name` through the raw JSON path comes back without it. No flag
 * is exposed for it, since it would silently do nothing.
 *
 * This shape is absent from the SDK types, which model the trigger union with
 * no mqtt_topic member — hence the cast.
 */
function buildMQTTTopicTrigger(options: BuilderOptions) {
  return {
    topic: requireFlag(options.topic, "--topic", options),
    tag_key: requireFlag(options.triggerTagKey, "--trigger-tag-key", options),
    tag_value: requireFlag(options.triggerTagValue, "--trigger-tag-value", options),
    // `as unknown as` is required, not lazy: `ActionTriggerType` has no
    // mqtt_topic member at all, so this shape overlaps with none of the union's
    // variants and TypeScript rejects a direct assertion.
  } as unknown as ActionTriggerType;
}

/**
 * @description Builds the `trigger` array from the chosen `--type` and its
 * typed flags, or passes `--trigger-json` through verbatim. Always returns an
 * array, matching `ActionCreateInfo.trigger`.
 */
function buildTrigger(type: ActionTypeName, options: BuilderOptions): ActionTriggerType[] {
  if (!ACTION_TYPES.includes(type)) {
    failWith(`Invalid --type "${type}". Valid types: ${ACTION_TYPES.join(", ")}.`, "invalid_trigger_type", options.json);
  }

  const typedFlags = [
    options.triggerDevice,
    options.triggerVariable,
    options.triggerIs,
    options.cron,
    options.interval,
    options.resource,
    options.service,
    options.topic,
  ];

  if (options.triggerJson) {
    if (typedFlags.some((flag) => flag !== undefined)) {
      failWith("Pass either the typed trigger flags or --trigger-json, not both.", "conflicting_trigger_input", options.json);
    }
    return parseJSONFlag(options.triggerJson, "--trigger-json", "array", options) as ActionTriggerType[];
  }

  if (JSON_ONLY_TYPES.has(type)) {
    failWith(`--type ${type} has no typed flags; pass --trigger-json instead.`, "missing_trigger_field", options.json);
  }

  switch (type) {
    case "condition":
      return [buildConditionTrigger(options)];
    case "schedule":
      return [
        {
          cron: requireFlag(options.cron, "--cron", options),
          timezone: requireFlag(options.timezone, "--timezone", options),
        } as ActionTriggerType,
      ];
    case "interval":
      return [{ interval: requireFlag(options.interval, "--interval", options) } as ActionTriggerType];
    case "resource":
      return [buildResourceTrigger(options)];
    case "mqtt_topic":
      return [buildMQTTTopicTrigger(options)];
    default:
      return [
        {
          service_or_resource: requireFlag(options.service, "--service", options),
          condition: requireFlag(options.condition, "--condition", options),
          condition_value: Number(requireFlag(options.conditionValue, "--condition-value", options)),
        } as ActionTriggerType,
      ];
  }
}

/**
 * @description Builds the `action` target from exactly one target flag group.
 * `--action-json` covers every target type without typed-flag support
 * (sms, mqtt, twilio, sendgrid, smtp, sqs, notification_run).
 */
function buildActionTarget(options: BuilderOptions): ActionTypeParams {
  const targets = [
    options.runScript?.length ? "script" : undefined,
    options.notification ? "notification" : undefined,
    options.email ? "email" : undefined,
    options.post ? "post" : undefined,
    options.actionJson ? "json" : undefined,
  ].filter(Boolean);

  if (targets.length === 0) {
    failWith("No action target given. Pass one of --run-script, --notification, --email, --post, or --action-json.", "missing_action", options.json);
  }
  if (targets.length > 1) {
    failWith(`Conflicting action targets: ${targets.join(", ")}. Pass exactly one.`, "conflicting_action", options.json);
  }

  if (options.actionJson) {
    return parseJSONFlag(options.actionJson, "--action-json", "object", options) as ActionTypeParams;
  }

  if (options.runScript?.length) {
    return { type: "script", script: options.runScript };
  }

  if (options.notification) {
    return {
      type: "notification",
      subject: requireFlag(options.subject, "--subject", options),
      message: requireFlag(options.message, "--message", options),
    };
  }

  if (options.email) {
    return {
      type: "email",
      to: options.email,
      subject: requireFlag(options.subject, "--subject", options),
      message: requireFlag(options.message, "--message", options),
    };
  }

  return {
    type: "post",
    url: options.post as string,
    headers: parseHeaders(options.header, options),
  };
}

export { ACTION_TYPES, buildActionTarget, buildTrigger, CONDITIONALS, inferValueType, parseHeaders, parseJSONFlag };
export type { ActionTypeName, BuilderOptions, ValueType };
