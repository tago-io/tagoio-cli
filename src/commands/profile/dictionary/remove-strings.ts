function removeDuplicatesAndEmptyStrings(arr: string[]): string[] {
  const uniqueSet = new Set<string>();
  const result: string[] = [];

  for (const item of arr) {
    const lowerCasedItem = item.toLowerCase().trim();
    if (lowerCasedItem && !uniqueSet.has(lowerCasedItem)) {
      uniqueSet.add(lowerCasedItem);
      result.push(item);
    }
  }

  return result;
}

export { removeDuplicatesAndEmptyStrings };
