import { vi, type Mock } from "vitest";

// Some Account resources are nested (e.g. `account.dashboards.widgets.info`).
// Everything else is a flat `namespace.method`.
const NESTED_NAMESPACES = new Set(["widgets"]);

type AnyRecord = Record<string, unknown>;

function makeMethodNamespace(): AnyRecord {
  return new Proxy({} as AnyRecord, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop];
      }
      const child = NESTED_NAMESPACES.has(prop) ? makeMethodNamespace() : vi.fn();
      target[prop] = child;
      return child;
    },
  });
}

/**
 * `any` leaves let tests call `account.devices.info` / `account.dashboards.widgets.info`
 * without fighting the type system over whether a Proxy key yields a `Mock` or a namespace.
 */
type MockedAccount = { [namespace: string]: any };

function makeAccount(): MockedAccount {
  return new Proxy({} as MockedAccount, {
    get(target, prop: string) {
      if (prop in target) {
        return target[prop];
      }
      const namespace = makeMethodNamespace();
      target[prop] = namespace;
      return namespace;
    },
  });
}

export { makeAccount, type MockedAccount, type Mock };
