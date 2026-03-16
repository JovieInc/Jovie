/**
 * Shared utilities for unwrapping PostgreSQL errors from Drizzle/Neon wrappers.
 *
 * Drizzle ORM wraps PG errors in DrizzleQueryError where the original PG error
 * (with code, constraint, detail) lives on `.cause`. Some Neon drivers use
 * `.sourceError` or `.error`. This module walks those chains to find the
 * underlying PG error fields.
 */

const MAX_UNWRAP_DEPTH = 8;

export interface PgErrorFields {
  code: string | null;
  constraint: string | null;
  message: string;
  detail: string | null;
}

const EMPTY: PgErrorFields = {
  code: null,
  constraint: null,
  message: '',
  detail: null,
};

/**
 * Recursively unwrap Drizzle/Neon error wrappers to find the underlying
 * PostgreSQL error fields (code, constraint, detail).
 */
export function unwrapPgError(error: unknown, depth = 0): PgErrorFields {
  if (depth > MAX_UNWRAP_DEPTH || !error) return EMPTY;
  if (typeof error !== 'object') return EMPTY;

  const rec = error as Record<string, unknown>;

  const code = typeof rec.code === 'string' ? rec.code : null;
  const constraint = typeof rec.constraint === 'string' ? rec.constraint : null;
  const message = typeof rec.message === 'string' ? rec.message : '';
  const detail = typeof rec.detail === 'string' ? rec.detail : null;

  // If this level has a PG error code, return it
  if (code) {
    return { code, constraint, message, detail };
  }

  // Walk known wrapper properties: .cause (Drizzle), .sourceError (Neon), .error
  for (const key of ['cause', 'sourceError', 'error'] as const) {
    const nested = rec[key];
    if (nested && typeof nested === 'object') {
      const result = unwrapPgError(nested, depth + 1);
      if (result.code) return result;
    }
  }

  return { code, constraint, message, detail };
}

/**
 * Check whether an error (possibly Drizzle-wrapped) is a PostgreSQL
 * unique_violation (23505), optionally on a specific constraint.
 */
export function isUniqueViolation(
  error: unknown,
  constraint?: string
): boolean {
  const pg = unwrapPgError(error);
  if (pg.code !== '23505') return false;
  if (!constraint) return true;
  return (
    pg.constraint === constraint ||
    pg.message.includes(constraint) ||
    (pg.detail ?? '').includes(constraint)
  );
}
