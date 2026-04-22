import { describe, expect, test } from "vitest";

import { searchName } from "./search-name.js";

describe("searchName (fuzzy pick of the closest-matching item by cosine similarity)", () => {
  const list = [
    { names: ["dashboard-handler", "dashboard-handler.ts"], value: "dashboard" },
    { names: ["payment-processor", "payment-processor.ts"], value: "payment" },
    { names: ["user-auth", "user-auth.ts"], value: "auth" },
  ];

  test("returns the value for the closest-matching item by full name", () => {
    expect(searchName("dashboard-handler", list)).toBe("dashboard");
  });

  test("is case-insensitive on the query (key is lowercased internally)", () => {
    expect(searchName("DASHBOARD-HANDLER", list)).toBe("dashboard");
  });

  test("matches against filenames stripped of .ts extension (the orderNames branch)", () => {
    expect(searchName("payment-processor.ts", list)).toBe("payment");
  });

  test("returns the top fuzzy hit even when the query is a partial/misspelled name", () => {
    // "dashbord" (missing 'a') should still land on the dashboard entry.
    expect(searchName("dashbord", list)).toBe("dashboard");
  });

  test("returns undefined when the list is empty", () => {
    expect(searchName("anything", [])).toBe(undefined);
  });
});
