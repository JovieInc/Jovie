import { createHash } from 'node:crypto';

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function evidenceFingerprint(value) {
  return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`;
}
