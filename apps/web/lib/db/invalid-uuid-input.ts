/**
 * Postgres rejects a non-UUID bound to a uuid column with SQLSTATE 22P02.
 * Callers that pass a route param straight into that column should treat the
 * error as "no such row" instead of an internal failure.
 */
export function isInvalidUuidInput(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (record.code === '22P02') return true;
    if (
      typeof record.message === 'string' &&
      record.message.includes('invalid input syntax for type uuid')
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}
