function isDictionaryString(string: string): boolean {
  if (string.length === 0) {
    return false;
  }

  return string.at(0) === "#" && string.at(-1) === "#";
}

export { isDictionaryString };
