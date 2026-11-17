export type JsonArray<T> = T[] | string | null;

/** Normalize array aggregates returned as decoded JSON or JSON text. */
export const parseJsonArray = <T>(value: JsonArray<T>): T[] => {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T[];
    } catch {
      return [];
    }
  }

  return value;
};
