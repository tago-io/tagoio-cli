import { describe, expect, test, vi } from "vitest";

vi.mock("../../lib/messages.js", () => ({
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
}));

const SLOT = "6adf687312f2ac000cafd9a5";

/**
 * The filters of "Custom Widget #1" on the "QA Test" dashboard, exactly as the
 * Admin stored them, and the `resource` entries the Admin derived from them.
 */
const ADMIN_GROUPS = {
  device: [
    {
      id: "8nbfgymjKl1CHg7knd0QH",
      filters: [
        { from_blueprint: true, tag_key: "", tag_value: "", blueprint_device: SLOT, blueprint_device_tag_match: "customer_id" },
        { from_blueprint: false, tag_key: "device_type", tag_value: "sensor", blueprint_device: "", blueprint_device_tag_match: "" },
      ],
      data: [
        { type: "parameter", parameter: "name", editable: false },
        { type: "configuration_parameter", configuration_parameter: "address", editable: false },
        { type: "tag", tag: "eui", editable: false },
      ],
    },
  ],
  user: [
    {
      id: "pDYF7Vh5aNdPK4WaQqhfC",
      filters: [{ from_blueprint: false, tag_key: "mock", tag_value: "true", blueprint_device: "", blueprint_device_tag_match: "" }],
      data: [
        { type: "parameter", parameter: "name", editable: true },
        { type: "parameter", parameter: "email", editable: false },
        { type: "tag", tag: "customer_id", editable: true },
      ],
    },
  ],
  entity: [
    {
      id: "ugQQSxCOCo9wIBxpwX_Wz",
      filters: [{ from_blueprint: false, tag_key: "entity_type", tag_value: "qa_test", blueprint_device: "", blueprint_device_tag_match: "" }],
      data: [{ type: "field", field: "id", editable: true }],
    },
  ],
};

const ADMIN_RESOURCE = {
  device: {
    type: "device",
    view: ["name", "param.address", "tags.eui"],
    amount: 1000,
    filter: [
      { key: "customer_id", value: SLOT },
      { key: "device_type", value: "sensor" },
    ],
    orderBy: "created_at,asc",
    editable: [],
  },
  user: {
    type: "user",
    view: ["name", "email", "tags.customer_id"],
    amount: 1000,
    filter: [{ key: "mock", value: "true" }],
    orderBy: "created_at,asc",
    editable: ["name", "tags.customer_id"],
  },
  entity: {
    type: "entity_list",
    view: ["id"],
    amount: 1000,
    filter: [{ key: "entity_type", value: "qa_test" }],
    orderBy: "desc",
    editable: ["id"],
  },
};

describe("groupToResource", () => {
  test.each(["device", "user", "entity"] as const)("derives the %s entry the Admin derived on the QA Test widget", async (kind) => {
    const { groupToResource, normalizeGroups } = await import("./widget-resource.js");
    const [group] = normalizeGroups(ADMIN_GROUPS[kind], kind);

    expect(groupToResource(kind, group)).toEqual(ADMIN_RESOURCE[kind]);
  });
});

describe("normalizeGroups", () => {
  test("fills the Admin's stored shape from a short form and keeps a copied id", async () => {
    const { normalizeGroups } = await import("./widget-resource.js");
    const [group] = normalizeGroups(
      [{ id: "kept", filters: [{ blueprint_device: SLOT, blueprint_device_tag_match: "customer_id" }], data: [{ type: "tag", tag: "eui", editable: true }] }],
      "device",
    );

    expect(group).toEqual({
      id: "kept",
      filters: [{ from_blueprint: true, tag_key: "", tag_value: "", blueprint_device: SLOT, blueprint_device_tag_match: "customer_id" }],
      data: [{ type: "tag", tag: "eui", editable: true }],
    });
  });

  test("a new group gets a 21-character id", async () => {
    const { normalizeGroups } = await import("./widget-resource.js");
    const [group] = normalizeGroups([{ filters: [], data: [] }], "user");

    expect(group.id).toMatch(/^[A-Za-z0-9_-]{21}$/);
  });

  test.each([
    [[{ filters: "x", data: [] }], /"filters" and "data" arrays/],
    [[{ filters: [{ tag_value: "x" }], data: [] }], /expected tag_key and tag_value/],
    [[{ filters: [{ from_blueprint: true, blueprint_device: SLOT }], data: [] }], /needs blueprint_device \(the slot ID\) and blueprint_device_tag_match/],
    [[{ filters: [], data: [{ type: "column", name: "x" }] }], /"type" must be one of/],
    [[{ filters: [], data: [{ type: "tag" }] }], /a "tag" column needs a "tag" name/],
  ])("rejects a malformed group offline", async (groups, message) => {
    const { normalizeGroups } = await import("./widget-resource.js");

    expect(() => normalizeGroups(groups as unknown[], "device")).toThrow(message);
  });
});

describe("applyFilterGroups", () => {
  test("replaces only the sections passed and keeps entries no section produces", async () => {
    const { applyFilterGroups, normalizeGroups } = await import("./widget-resource.js");
    const slotEntity = { id: SLOT, type: "entity", view: ["name"], index: "id_updated_at_idx" };
    const current = {
      resourceOptions: { user: { groups: normalizeGroups(ADMIN_GROUPS.user, "user") }, device: { groups: normalizeGroups(ADMIN_GROUPS.device, "device") } },
      resource: [slotEntity, ADMIN_RESOURCE.device, ADMIN_RESOURCE.user],
    };
    const devices = normalizeGroups([{ filters: [{ tag_key: "device_type", tag_value: "pump" }], data: [{ type: "parameter", parameter: "name" }] }], "device");

    const next = applyFilterGroups(current, { device: devices });

    expect(next.resourceOptions.user).toEqual(current.resourceOptions.user);
    expect(next.resourceOptions.device).toEqual({ groups: devices });
    expect(next.resource).toEqual([
      slotEntity,
      ADMIN_RESOURCE.user,
      { type: "device", view: ["name"], amount: 1000, filter: [{ key: "device_type", value: "pump" }], orderBy: "created_at,asc", editable: [] },
    ]);
  });

  test("an empty list clears a section and its entries", async () => {
    const { applyFilterGroups } = await import("./widget-resource.js");

    const next = applyFilterGroups({ resourceOptions: undefined, resource: [ADMIN_RESOURCE.entity, ADMIN_RESOURCE.user] }, { entity: [] });

    expect(next.resourceOptions).toEqual({ entity: { groups: [] } });
    expect(next.resource).toEqual([ADMIN_RESOURCE.user]);
  });
});

describe("describeGroups", () => {
  test("renders one readable line per group", async () => {
    const { describeGroups, normalizeGroups } = await import("./widget-resource.js");

    expect(describeGroups({ device: { groups: normalizeGroups(ADMIN_GROUPS.device, "device") } })).toEqual([
      `device: customer_id=<slot ${SLOT}>, device_type=sensor; columns name, param.address, tags.eui`,
    ]);
  });
});

describe("normalizeEntitySources", () => {
  /** The entry the Admin stored for an entity data source bound to a Blueprint slot. */
  test("fills the defaults the Admin writes", async () => {
    const { normalizeEntitySources } = await import("./widget-resource.js");

    expect(normalizeEntitySources([{ id: SLOT, view: ["name"] }])).toEqual([
      { id: SLOT, type: "entity", view: ["name"], index: "id_updated_at_idx", amount: 1000, orderBy: "desc", editable: [] },
    ]);
  });

  test("keeps what is given", async () => {
    const { normalizeEntitySources } = await import("./widget-resource.js");
    const [source] = normalizeEntitySources([{ id: "e1", type: "entity", view: ["notes"], editable: ["notes"], index: "id_idx", amount: 50, orderBy: "asc" }]);

    expect(source).toMatchObject({ id: "e1", type: "entity", view: ["notes"], editable: ["notes"], index: "id_idx", amount: 50, orderBy: "asc" });
  });

  test.each([
    [[{ view: ["name"] }], /expected an object with "id"/],
    [[{ id: "e1" }], /"view" must list the fields/],
    [[{ id: "e1", view: [] }], /"view" must list the fields/],
    [[{ id: "e1", view: ["a"], editable: "a" }], /"editable" must list fields that are also in "view"/],
    [[{ id: "e1", view: ["a"], editable: ["b"] }], /"editable" must list fields that are also in "view"/],
    [[{ id: "e1", view: ["a"], order_by: "asc" }], /unknown key "order_by"/],
    [[{ id: "e1", type: "entity_list", view: ["a"] }], /"type" must be "entity" or left out/],
    [[{ id: "e1", view: ["a"], amount: 0 }], /"amount" must be a whole number from 1 to 10000/],
    [[{ id: "e1", view: ["a"], amount: 2.5 }], /"amount" must be a whole number from 1 to 10000/],
    [[{ id: "e1", view: ["a"], amount: 10001 }], /"amount" must be a whole number from 1 to 10000/],
    [[{ id: "e1", view: ["a"], orderBy: "newest" }], /"orderBy" must be "asc" or "desc"/],
  ])("rejects a malformed source offline", async (sources, message) => {
    const { normalizeEntitySources } = await import("./widget-resource.js");

    expect(() => normalizeEntitySources(sources as unknown[])).toThrow(message);
  });
});

describe("applyEntitySources", () => {
  test("replaces only the entity entries", async () => {
    const { applyEntitySources } = await import("./widget-resource.js");
    const next = applyEntitySources([{ type: "entity", id: "old" }, ADMIN_RESOURCE.device, ADMIN_RESOURCE.entity], [{ type: "entity", id: "new" }]);

    expect(next).toEqual([ADMIN_RESOURCE.device, ADMIN_RESOURCE.entity, { type: "entity", id: "new" }]);
  });
});
