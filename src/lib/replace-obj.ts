function replaceObj(original: any, replacer: { [key: string]: any }) {
  let string_obj = JSON.stringify(original);
  for (const key in replacer) {
    string_obj = string_obj.replaceAll(new RegExp(key, "g"), replacer[key]);
  }

  return JSON.parse(string_obj);
}

export { replaceObj };
