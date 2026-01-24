/**
 * SQL helper utilities for PostgreSQL-specific patterns with Drizzle ORM.
 *
 * These helpers provide type-safe, reusable patterns for common SQL operations
 * that Drizzle doesn't have native support for.
 */

import { type SQL, sql } from 'drizzle-orm';

/**
 * Build a PostgreSQL ARRAY literal from a readonly array.
 *
 * @example
 * sqlArray(['a', 'b', 'c']) // ARRAY['a', 'b', 'c']
 */
export function sqlArray<T extends string>(items: readonly T[]): SQL {
  return sql`ARRAY[${sql.join(
    items.map(item => sql`${item}`),
    sql`, `
  )}]`;
}

/**
 * Build an ANY(ARRAY[...]) expression for array matching.
 *
 * @example
 * sql`${column} = ${sqlAny(DSP_PLATFORMS)}` // column = ANY(ARRAY['spotify', ...])
 */
export function sqlAny<T extends string>(items: readonly T[]): SQL {
  return sql`ANY(${sqlArray(items)})`;
}

/**
 * Format a Date for PostgreSQL timestamp comparison.
 *
 * @example
 * sql`${column} >= ${sqlTimestamp(startDate)}` // column >= '2024-01-01T00:00:00.000Z'::timestamp
 */
export function sqlTimestamp(date: Date): SQL {
  return sql`${date.toISOString()}::timestamp`;
}

/**
 * Count with FILTER clause (PostgreSQL-specific conditional aggregation).
 *
 * @example
 * sqlCountFilter(sql`${column} = 'active'`) // count(*) filter (where column = 'active')
 */
export function sqlCountFilter(condition: SQL): SQL<number> {
  return sql<number>`count(*) filter (where ${condition})`;
}
