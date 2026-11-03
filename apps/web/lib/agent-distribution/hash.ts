import { createHash } from 'node:crypto';

/** Stable JSON: object keys sorted recursively, so hashes ignore key order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, sortKeys(entry)])
    );
  return value;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Hash of a tools/list `tools` array. The generator and the live cert harness must agree on this. */
export function hashTools(tools: readonly unknown[]): string {
  return sha256(canonicalJson(tools));
}
