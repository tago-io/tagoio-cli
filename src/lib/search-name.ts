import stringComparison from "string-comparison";

function orderNames(key: string, names: string[]) {
  const similarity = Math.max(
    ...names.map((x) => {
      const argValue = x.toLowerCase().replace(".ts", "");
      return stringComparison.cosine.similarity(key, argValue);
    })
  );

  return similarity;
}

function searchName(key: string, list: { names: string[]; value: any }[]) {
  const keyLowerCase = key.toLowerCase();
  // const orderedList = list.filter((x) => findAllNames(keyLowerCase, x.names)).sort((x) => orderNames(keyLowerCase, x.names));
  const orderedList = list.sort((a, b) => orderNames(keyLowerCase, a.names) - orderNames(keyLowerCase, b.names)).reverse();

  return orderedList[0]?.value;
}
export { searchName };
