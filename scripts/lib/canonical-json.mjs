/**
 * Canonical JSON for signed Summer payloads. Byte-for-byte identical to
 * `canonical` in JovieInc/symphony-control scripts/symphony/summer-symphony-outbox-consumer.mjs;
 * Summer verifies signatures over this exact serialization, so never change it alone.
 */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
