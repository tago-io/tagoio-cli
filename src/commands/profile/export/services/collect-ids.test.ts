import { describe, expect, test } from "vitest";

import { IExportHolder } from "../types";
import { getExportHolder } from "./collect-ids";

describe("Collect ID", () => {
  test("Get Export Holder - Devices", () => {
    const list = [
      { id: "Test1", token: "1234-1234-1234-1234", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "Test2", token: "1235-1235-1235-1235", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const import_list = [
      { id: "1Test", token: "4321-4321-4321-4321", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "2Test", token: "5321-5321-5321-5321", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const exportHolder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, tokens: {} };

    getExportHolder(list, import_list, "devices", exportHolder);

    expect(exportHolder.devices).toStrictEqual({ Test1: "1Test", Test2: "2Test" });
    expect(exportHolder.tokens).toStrictEqual({ "1234-1234-1234-1234": "4321-4321-4321-4321", "1235-1235-1235-1235": "5321-5321-5321-5321" });
  });

  test("Get Export Holder - Devices Token not Found", () => {
    const list = [
      { id: "Test1", token: "1234-1234-1234-1234", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "Test2", token: "1235-1235-1235-1235", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const import_list = [
      { id: "1Test", name: "1Test", tags: [{ key: "export_id", value: "config_dev" }] },
      { id: "2Test", token: "5321-5321-5321-5321", tags: [{ key: "export_id", value: "other_dev" }] },
    ];

    const exportHolder: IExportHolder = { devices: {}, analysis: {}, dashboards: {}, tokens: {} };

    expect(() => Promise.reject(getExportHolder(list, import_list, "devices", exportHolder))).toThrow("Device Token not found: 1Test [1Test]");
  });
});
