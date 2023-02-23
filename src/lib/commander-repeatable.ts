const cmdRepeteableValue = (value: string, previous: string | string[]) => {
  if (!previous) {
    previous = [];
  }
  if (typeof previous === "string") {
    previous = [previous];
  }
  return previous.concat([value]);
};

export { cmdRepeteableValue };
