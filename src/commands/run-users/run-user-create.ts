import { Resources, type UserCreateInfo } from "@tago-io/sdk";

import { getEnvironmentConfig } from "../../lib/config-file.js";
import { errorHandler, errorHandlerJSON, requireOrFail, successMSG } from "../../lib/messages.js";
import { buildTags } from "../devices/device-create.js";
import { resolveRunUserPassword } from "./run-user-password.js";

interface IOptions {
  environment?: string;
  name?: string;
  timezone?: string;
  company?: string;
  phone?: string;
  language?: string;
  tagkey?: string[];
  tagvalue?: string[];
  inactive?: boolean;
  silent?: boolean;
  json?: boolean;
}

function failWith(message: string, code: string, useJSON?: boolean): never {
  if (useJSON) {
    errorHandlerJSON(message, code);
  }
  errorHandler(`${code}: ${message}`);
}

/**
 * Shape only — no claim about deliverability.
 *
 * Worth checking offline because a malformed address is almost always a typo,
 * and on a profile at its Run user quota a wasted round trip is expensive.
 */
function assertEmailShape(email: string, options: IOptions) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    failWith(`"${email}" is not a valid email address.`, "invalid_email", options.json);
  }
}

/**
 * @description Resolves the timezone for a new user.
 *
 * The API requires the field, and no profile-level timezone exists — probed
 * `profiles.info("current")` and `run.info()`, neither carries one.
 * `account.info()` does, and works with the profile token these commands
 * already hold; `start-config.ts` and `list-env.ts` already call it.
 *
 * Called lazily: the lookup costs ~800ms, so it runs only when `--timezone` is
 * absent and only after the email pre-check has passed. The prompt fallback
 * covers an account whose timezone is unset — the field is typed `string`, but
 * nothing guarantees a value, and sending an empty one would fail the create.
 */
async function resolveTimezone(resources: Resources, options: IOptions): Promise<string> {
  if (options.timezone) {
    return options.timezone;
  }

  const account = await resources.account.info().catch(() => null);
  if (account?.timezone) {
    return account.timezone;
  }

  return requireOrFail(undefined, "timezone", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Timezone (e.g. America/Sao_Paulo):",
  });
}

async function runUserCreate(emailArg: string | undefined, options: IOptions) {
  const config = getEnvironmentConfig(options.environment);
  if (!config || !config.profileToken) {
    failWith("Environment not found", "env_not_found", options.json);
  }

  const resources = new Resources({ token: config.profileToken, region: config.profileRegion });

  const email = await requireOrFail(emailArg, "email", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Email:",
  });

  assertEmailShape(email, options);

  const name = await requireOrFail(options.name, "name", {
    silent: options.silent,
    json: options.json,
    promptMessage: "Name:",
  });

  // The API rejects a duplicate email with its own opaque error, and the Run
  // user quota makes a wasted create expensive. Checking first turns that into
  // something actionable — the same reason `secret-create` pre-checks its key.
  //
  // Deliberately before the password prompt: there is no point typing a
  // credential for a create that is already doomed. A failing lookup is ignored
  // — the API stays the authority, and a listing outage must not block a create.
  const existing = await resources.run.listUsers({ amount: 10000, fields: ["id", "email"] }).catch(() => null);
  const clash = existing?.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (clash) {
    failWith(`A run user with the email ${email} already exists. Emails are unique within a profile.`, "email_exists", options.json);
  }

  const timezone = await resolveTimezone(resources, options);

  // The only input for the password. No flag carries it, so this command cannot
  // run under --silent — resolveRunUserPassword reports that explicitly.
  const password = await resolveRunUserPassword(options, `Password for ${email}:`);

  const tags = buildTags(options.tagkey, options.tagvalue);

  const payload: UserCreateInfo = {
    name,
    email,
    password,
    timezone,
    active: !options.inactive,
    ...(options.company ? { company: options.company } : {}),
    ...(options.phone ? { phone: options.phone } : {}),
    ...(options.language ? { language: options.language } : {}),
    ...(tags ? { tags } : {}),
  };

  const created = await resources.run.userCreate(payload).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // Only the API's message is reported. Echoing the payload here would put the
    // password into whatever captured the error. The quota rejection already
    // names its own limit, so it passes through intact.
    failWith(`Failed to create run user ${email}: ${message}`, "create_failed", options.json);
  });

  if (!created) {
    return;
  }

  if (options.json) {
    // `userCreate` resolves `{ user }` — the fourth distinct id key in this
    // codebase, after `{ device_id }`, `{ action }` and `{ dictionary }`.
    process.stdout.write(`${JSON.stringify({ id: created.user, email, name, active: !options.inactive })}\n`);
    return;
  }

  successMSG(`Run user created: ${email} [${created.user}].`);
}

export { assertEmailShape, runUserCreate };
