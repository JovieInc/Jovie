/**
 * Shared keyset-cursor helpers for audience pagination queries.
 *
 * Extracted to eliminate duplication between the API route handler and the
 * server-data module (JOV-1254).
 */

import { and, sql as drizzleSql, eq, gt, lt, or, type SQL } from 'drizzle-orm';

/** Encodes a keyset cursor: base64url(JSON({v: sortValue, id: rowId})). */
export function encodeCursor(sortValue: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: sortValue, id })).toString(
    'base64url'
  );
}

/** Decodes an opaque cursor. Returns null on malformed input. */
export function decodeCursor(cursor: string): { v: string; id: string } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.v === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return parsed as { v: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Builds a keyset cursor WHERE condition for stable cursor pagination.
 *
 * DESC: next page satisfies (sortVal < cursorVal) OR (sortVal = cursorVal AND id < cursorId)
 * ASC:  next page satisfies (sortVal > cursorVal) OR (sortVal = cursorVal AND id > cursorId)
 */
export function buildCursorCondition(
  direction: 'asc' | 'desc',
  sortColumn: SQL,
  idColumn: SQL,
  cursorSortVal: unknown,
  cursorId: unknown
): SQL<unknown> {
  if (direction === 'desc') {
    return or(
      lt(sortColumn, drizzleSql`${cursorSortVal}`),
      and(
        eq(sortColumn, drizzleSql`${cursorSortVal}`),
        lt(idColumn, drizzleSql`${cursorId}`)
      )
    )!;
  }
  return or(
    gt(sortColumn, drizzleSql`${cursorSortVal}`),
    and(
      eq(sortColumn, drizzleSql`${cursorSortVal}`),
      gt(idColumn, drizzleSql`${cursorId}`)
    )
  )!;
}
