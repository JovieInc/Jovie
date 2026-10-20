import 'server-only';

export function providerRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function matchesNumericId(value: unknown, id: string): boolean {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    String(value) === id
  );
}

/** An official 404 is absence; rate limits, outages and malformed JSON are not. */
export async function readProviderJson(
  url: string,
  signal: AbortSignal
): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal,
    redirect: 'error',
  });
  signal.throwIfAborted();
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Catalog provider HTTP ${response.status}`);
  const payload: unknown = await response.json();
  signal.throwIfAborted();
  return payload;
}
