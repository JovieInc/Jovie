/**
 * SQL helper utilities for PostgreSQL-specific patterns with Drizzle ORM.
 *
 * These helpers provide type-safe, reusable patterns for common SQL operations
 * that Drizzle doesn't have native support for.
 */

import { sql as drizzleSql, type SQL } from 'drizzle-orm';

/**
 * Build a PostgreSQL ARRAY literal from a readonly array.
 *
 * @example
 * sqlArray(['a', 'b', 'c']) // ARRAY['a', 'b', 'c']
 */
export function sqlArray<T extends string>(items: readonly T[]): SQL {
  return drizzleSql`ARRAY[${drizzleSql.join(
    items.map(item => drizzleSql`${item}`),
    drizzleSql`, `
  )}]`;
}

/**
 * Build an ANY(ARRAY[...]) expression for array matching.
 *
 * @example
 * drizzleSql`${column} = ${sqlAny(DSP_PLATFORMS)}` // column = ANY(ARRAY['spotify', ...])
 */
export function sqlAny<T extends string>(items: readonly T[]): SQL {
  return drizzleSql`ANY(${sqlArray(items)})`;
}

/**
 * Format a Date for PostgreSQL timestamp comparison.
 *
 * @example
 * drizzleSql`${column} >= ${sqlTimestamp(startDate)}` // column >= '2024-01-01T00:00:00.000Z'::timestamp
 */
export function sqlTimestamp(date: Date): SQL {
  return drizzleSql`${date.toISOString()}::timestamp`;
}

/**
 * Count with FILTER clause (PostgreSQL-specific conditional aggregation).
 *
 * @example
 * sqlCountFilter(drizzleSql`${column} = 'active'`) // count(*) filter (where column = 'active')
 */
export function sqlCountFilter(condition: SQL): SQL<number> {
  return drizzleSql<number>`count(*) filter (where ${condition})`;
}
