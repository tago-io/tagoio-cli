const TOKEN_FIELD_NAMES = new Set(["token", "analysis_token"]);

/**
 * @description Removes credential fields at any depth before a record is
 * printed. Dashboard and widget records can carry `token` or `analysis_token`
 * nested inside display settings, so dropping top-level keys alone is not
 * enough.
 */
function stripTokenFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripTokenFields);
  }
  // The SDK parses timestamps into Date instances, which have no enumerable
  // entries; walking one would turn it into {}.
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "object" && value !== null) {
    const stripped: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!TOKEN_FIELD_NAMES.has(key)) {
        stripped[key] = stripTokenFields(entry);
      }
    }
    return stripped;
  }
  return value;
}

export { stripTokenFields };
