function generateDictionaryKey(string: string): string {
  return string
    .toUpperCase()
    .replaceAll(/[[\]{}().,:;!?#]+/g, " ")
    .trim()
    .replaceAll(/\s+/g, "_");
}

export { generateDictionaryKey };
