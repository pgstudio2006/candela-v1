/** Strip Date/BigInt/Decimal before server actions cross the wire. */
export function serializeForClient<T>(value: T): T {
  if (value === undefined) return undefined as T;
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v !== null && typeof v === "object" && "toJSON" in v && typeof v.toJSON === "function") {
        return v.toJSON();
      }
      return v;
    }),
  ) as T;
}
