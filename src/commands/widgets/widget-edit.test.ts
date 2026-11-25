import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { makeEnvironmentConfig } from "../../test-utils/mock-config.js";
import { makeAccount } from "../../test-utils/mock-sdk.js";

const getEnvironmentConfigMock = vi.fn();

let resourcesInstance: ReturnType<typeof makeAccount>;

vi.mock("@tago-io/sdk", () => ({
  Resources: function Resources() {
    return resourcesInstance;
  },
}));

vi.mock("../../lib/config-file.js", () => ({
  getEnvironmentConfig: getEnvironmentConfigMock,
}));

vi.mock("../../lib/messages.js", () => ({
  errorHandler: (str: unknown) => {
    throw new Error(String(str));
  },
  errorHandlerJSON: (message: string, code?: string) => {
    throw new Error(`json:${code}:${message}`);
  },
  successMSG: vi.fn(),
  infoMSG: vi.fn(),
}));

vi.mock("../../prompt/pick-dashboard-id-from-tagoio.js", () => ({
  pickDashboardIDFromTagoIO: vi.fn(),
}));

const D = "6a68b4f5e4b1e5000b5ab1ef";
const W = "6ad1084c174a0b000cb231a4";
const SLOT_ENTITY = { id: "6adf687312f2ac000cafd9a5", type: "entity", view: ["name"], index: "id_updated_at_idx" };

/** A custom widget as the Admin stores it once code is uploaded and filters set. */
const STORED = {
  id: W,
  label: "Users",
  type: "iframe",
  analysis_run: "6adf6f3f12f2ac000cb16d2c",
  display: {
    url: `https://files.us-e1.tago.io/6a91f697b1ccff000c3eb271/storage/widgets/${W}.tsx`,
    artifact_url: `https://files.us-e1.tago.io/6a91f697b1ccff000c3eb271/storage/widgets/.bundled/${W}/abc.html`,
    header_buttons: [{ label: "Open" }],
    parameters: [{ key: "view_type", value: "manager" }],
    resource_options: { user: { groups: [{ id: "u1", filters: [], data: [] }] } },
  },
  resource: [SLOT_ENTITY, { type: "user", view: ["email"], filter: [{ key: "mock", value: "true" }] }],
};

describe("widgetEdit", () => {
  beforeEach(() => {
    resourcesInstance = makeAccount();
    getEnvironmentConfigMock.mockReset().mockReturnValue(makeEnvironmentConfig());
    resourcesInstance.dashboards.widgets.info.mockResolvedValue(structuredClone(STORED));
    resourcesInstance.dashboards.widgets.edit.mockResolvedValue("Successfully Updated");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Probed: a PUT without analysis_run clears it, so even a rename sends it back. */
  test("a label-only edit still sends the stored analysis and leaves display alone", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, label: "Team" });

    expect(resourcesInstance.dashboards.widgets.edit).toHaveBeenCalledWith(D, W, { label: "Team", analysis_run: STORED.analysis_run });
  });

  /** Probed: a PUT with a partial display replaced the whole object, dropping url and parameters. */
  test("new parameters go back inside the complete stored display", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, param: ["view_type=viewer"] });

    const patch = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2];
    expect(patch.display).toEqual({ ...STORED.display, parameters: [{ key: "view_type", value: "viewer" }] });
  });

  test("--max-data goes back inside the complete stored display", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, maxData: 2500 });

    const patch = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2];
    expect(patch.display).toEqual({ ...STORED.display, max_data: 2500 });
    expect(patch.resource).toBeUndefined();
  });

  test("--frame-settings fills the schema defaults, keeps the rest of display and replaces only the keys given", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    const radius = { top_left: 16, top_right: 16, bottom_left: 16, bottom_right: 16 };
    await widgetEdit(W, { dashboard: D, frameSettings: JSON.stringify({ radius }) });

    const patch = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2];
    expect(patch.display).toEqual({
      ...STORED.display,
      frame_settings: { radius, padding: { top: 5, right: 5, bottom: 5, left: 5 }, shadow: { hide: false }, header_visibility: "show_always" },
    });
  });

  test("--frame-settings keeps the stored frame keys not given", async () => {
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({
      ...structuredClone(STORED),
      display: { ...STORED.display, frame_settings: { shadow: { hide: true }, header_visibility: "show_on_hover" } },
    });
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, frameSettings: '{"padding":{"top":0,"right":0,"bottom":0,"left":0}}' });

    const frame = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2].display.frame_settings;
    expect(frame).toMatchObject({ shadow: { hide: true }, header_visibility: "show_on_hover", padding: { top: 0, right: 0, bottom: 0, left: 0 } });
  });

  test("--frame-settings with one corner keeps the stored corners", async () => {
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({
      ...structuredClone(STORED),
      display: { ...STORED.display, frame_settings: { radius: { top_left: 16, top_right: 16, bottom_left: 16, bottom_right: 16 } } },
    });
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, frameSettings: '{"radius":{"top_left":0}}' });

    const frame = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2].display.frame_settings;
    expect(frame.radius).toEqual({ top_left: 0, top_right: 16, bottom_left: 16, bottom_right: 16 });
  });

  test.each([
    ['{"header_visbility":"show_on_hover"}', /unknown key "header_visbility"/],
    ['{"header_visibility":"hover"}', /"header_visibility" must be/],
    ['{"radius":{"topleft":16}}', /"radius" must be an object with top_left/],
    ['{"padding":5}', /"padding" must be an object with top/],
    ['{"toString":{"a":1}}', /unknown key "toString"/],
    ['{"constructor":{}}', /unknown key "constructor"/],
    ['{"__proto__":{"x":1}}', /unknown key "__proto__"/],
    ['{"radius":{"top_left":"big"}}', /"radius" values must be numbers of 0 or more/],
    ['{"padding":{"top":-4}}', /"padding" values must be numbers of 0 or more/],
    ['{"padding":{"top":1e999}}', /"padding" values must be numbers of 0 or more/],
    ['{"shadow":{"hide":"yes"}}', /"shadow" values must be true or false/],
  ])("--frame-settings %s fails before any call", async (frameSettings, message) => {
    const { widgetEdit } = await import("./widget-edit.js");

    await expect(widgetEdit(W, { dashboard: D, frameSettings })).rejects.toThrow(message);
    expect(resourcesInstance.dashboards.widgets.info).not.toHaveBeenCalled();
  });

  test("--frame-settings that is not a JSON object fails before any call", async () => {
    const { widgetEdit } = await import("./widget-edit.js");

    await expect(widgetEdit(W, { dashboard: D, frameSettings: "[]" })).rejects.toThrow(/--frame-settings/);
    expect(resourcesInstance.dashboards.widgets.info).not.toHaveBeenCalled();
  });

  test("a device filter adds its group and entry and keeps the user groups and the slot entity", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, deviceFilter: '[{"id":"d1","filters":[{"tag_key":"device_type","tag_value":"sensor"}],"data":[]}]' });

    const patch = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2];
    expect(patch.display.resource_options.user).toEqual(STORED.display.resource_options.user);
    expect(patch.display.resource_options.device.groups[0].id).toBe("d1");
    expect(patch.display.url).toBe(STORED.display.url);
    expect(patch.resource).toEqual([
      SLOT_ENTITY,
      STORED.resource[1],
      expect.objectContaining({ type: "device", filter: [{ key: "device_type", value: "sensor" }] }),
    ]);
  });

  test("--entity-source replaces the entity entry and keeps the stored filters", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, entitySource: '[{"id":"slot2","view":["notes"]}]' });

    const patch = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2];
    expect(patch.resource).toEqual([STORED.resource[1], expect.objectContaining({ type: "entity", id: "slot2", view: ["notes"] })]);
    // Only resource changes: display, with the Admin's filter groups, is not sent.
    expect(patch.display).toBeUndefined();
  });

  test("--clear-entity-source drops only the entity entries", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, clearEntitySource: true });

    expect(resourcesInstance.dashboards.widgets.edit.mock.calls[0][2].resource).toEqual([STORED.resource[1]]);
  });

  test("a filter and an entity source change together in one edit", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, {
      dashboard: D,
      deviceFilter: '[{"id":"d1","filters":[{"tag_key":"device_type","tag_value":"sensor"}],"data":[]}]',
      entitySource: '[{"id":"slot2","view":["notes"]}]',
    });

    const patch = resourcesInstance.dashboards.widgets.edit.mock.calls[0][2];
    expect(patch.resource.map((entry: { type: string }) => entry.type)).toEqual(["user", "device", "entity"]);
  });

  test("--clear-analysis sends null", async () => {
    const { widgetEdit } = await import("./widget-edit.js");
    await widgetEdit(W, { dashboard: D, clearAnalysis: true });

    expect(resourcesInstance.dashboards.widgets.edit.mock.calls[0][2]).toEqual({ analysis_run: null });
  });

  test("nothing to change fails before any call", async () => {
    const { widgetEdit } = await import("./widget-edit.js");

    await expect(widgetEdit(W, { dashboard: D })).rejects.toThrow(/no_changes/);
    expect(resourcesInstance.dashboards.widgets.info).not.toHaveBeenCalled();
  });

  test("a widget that is not a custom widget is refused", async () => {
    resourcesInstance.dashboards.widgets.info.mockResolvedValue({ id: W, type: "display" });
    const { widgetEdit } = await import("./widget-edit.js");

    await expect(widgetEdit(W, { dashboard: D, label: "x" })).rejects.toThrow(/not_custom_widget/);
    expect(resourcesInstance.dashboards.widgets.edit).not.toHaveBeenCalled();
  });

  test("--silent without --dashboard fails", async () => {
    const { widgetEdit } = await import("./widget-edit.js");

    await expect(widgetEdit(W, { label: "x", silent: true })).rejects.toThrow(/missing_input: Missing required input: --dashboard/);
  });
});
