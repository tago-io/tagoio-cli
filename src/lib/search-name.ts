import { cosine } from "string-comparison";

function searchName(key: string, ...args: string[]) {
  const keyLowerCase = key.toLowerCase();
  return args.some((x) => {
    const argValue = x.toLowerCase().replace(".ts", "");
    return cosine.similarity(keyLowerCase, argValue) > 0.6;
  });
}
export { searchName };
