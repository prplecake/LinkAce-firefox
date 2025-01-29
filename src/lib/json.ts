const toSnakeCase = (str: string) => str.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
export const SnakeCaseReplacer = (key: string, value: any) => {
  if (value && typeof value === "object") {
    const replacement: {[key: string]: any} = {};
    for (const k in value){
      replacement[toSnakeCase(k)] = value[k];
    }
    return replacement;
  }
  return value;
};