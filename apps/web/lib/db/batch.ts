/**
 * Database Batch Operations
 *
 * Utilities for efficient bulk insert/update/upsert operations.
 * Uses Drizzle's native batch support and PostgreSQL's advanced features.
 */

import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { type DbOrTransaction, db } from './index';

// Maximum batch size to prevent memory issues and timeout
export const DEFAULT_BATCH_SIZE = 100;
export const MAX_BATCH_SIZE = 1000;

/** Validate an id/sortOrder pair shared by batch update functions. */
function validateBatchItem(id: unknown, sortOrder: unknown): void {
  if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) {
    throw new TypeError('Invalid ID format in batch update');
  }
  if (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder)) {
    throw new TypeError('Invalid sortOrder in batch update');
  }
}

export interface BatchInsertOptions {
  batchSize?: number;
  onConflict?: 'ignore' | 'update';
}

export interface BatchUpdateItem<T> {
  id: string;
  data: Partial<T>;
}

/**
 * Batch insert with automatic chunking and conflict handling.
 *
 * @param table - The Drizzle table to insert into
 * @param values - Array of values to insert
 * @param options - Options for batch size and conflict handling
 * @returns Count of inserted and skipped rows
 */
export async function batchInsert<T extends PgTable>(
  table: T,
  values: T['$inferInsert'][],
  options: BatchInsertOptions = {}
): Promise<{ inserted: number; skipped: number }> {
  const { batchSize = DEFAULT_BATCH_SIZE, onConflict = 'ignore' } = options;

  if (values.length === 0) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped = 0;

  // Process in chunks
  for (let i = 0; i < values.length; i += batchSize) {
    const chunk = values.slice(i, i + batchSize);

    try {
      if (onConflict === 'ignore') {
        const result = await db
          .insert(table)
          .values(chunk)
          .onConflictDoNothing()
          .returning();
        inserted += result.length;
        skipped += chunk.length - result.length;
      } else {
        const result = await db.insert(table).values(chunk).returning();
        inserted += result.length;
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { context: 'batch_insert' },
        extra: { chunkSize: chunk.length, chunkIndex: i / batchSize },
      });
      throw error;
    }
  }

  return { inserted, skipped };
}

/**
 * Optimized batch update for sort order changes.
 * Uses PostgreSQL VALUES clause with JOIN for single-statement update.
 *
 * This is much more efficient than N individual UPDATE queries.
 * Reduces N database round trips to 1.
 *
 * Assumes table has 'id' (uuid), 'sort_order' (integer), and 'updated_at' (timestamp) columns.
 *
 * @param table - The Drizzle table to update
 * @param orders - Array of id and sortOrder pairs
 */
export async function batchUpdateSortOrder<T extends PgTable>(
  table: T,
  orders: Array<{ id: string; sortOrder: number }>
): Promise<void> {
  if (orders.length === 0) return;

  for (const order of orders) {
    validateBatchItem(order.id, order.sortOrder);
  }

  // Build parameterized VALUES clause — each interpolated value becomes a bind parameter.
  const rows = orders.map(
    o => drizzleSql`(${o.id}::uuid, ${o.sortOrder}::integer)`
  );

  const tableName = getTableName(table);

  await db.execute(
    drizzleSql.join([
      drizzleSql.raw(
        `UPDATE ${tableName} AS t SET sort_order = v.sort_order, updated_at = NOW() FROM (VALUES `
      ),
      drizzleSql.join(rows, drizzleSql`, `),
      drizzleSql.raw(`) AS v(id, sort_order) WHERE t.id = v.id`),
    ])
  );
}

/**
 * Generic batch update with sequential operations.
 * Executes individual updates sequentially for complex update patterns.
 * Note: No transaction guarantees — Neon HTTP driver does not support them.
 *
 * @param updates - Array of id and data pairs
 * @param updateFn - Function to perform single update
 */
export async function batchUpdateSequential<T>(
  updates: Array<{ id: string; data: Partial<T> }>,
  updateFn: (
    dbClient: DbOrTransaction,
    id: string,
    data: Partial<T>
  ) => Promise<void>
): Promise<number> {
  if (updates.length === 0) return 0;

  for (const update of updates) {
    await updateFn(db, update.id, update.data);
  }
  return updates.length;
}

/**
 * Social link update data for batch operations.
 */
export interface SocialLinkUpdate {
  id: string;
  url: string;
  platform: string;
  platformType: string;
  displayText: string | null;
  sortOrder: number;
}

/**
 * Optimized batch update for social links.
 * Uses PostgreSQL VALUES clause with JOIN for single-statement update.
 *
 * Updates url, platform, platform_type, display_text, sort_order, and updated_at
 * in a single database round trip.
 *
 * @param updates - Array of social link updates
 */
export async function batchUpdateSocialLinks(
  updates: SocialLinkUpdate[]
): Promise<void> {
  if (updates.length === 0) return;

  for (const update of updates) {
    validateBatchItem(update.id, update.sortOrder);
  }

  // Build parameterized VALUES clause — each interpolated value becomes a bind parameter.
  const rows = updates.map(u => {
    const displayText =
      u.displayText === null ? drizzleSql`NULL` : drizzleSql`${u.displayText}`;
    return drizzleSql`(${u.id}::uuid, ${u.url}, ${u.platform}, ${u.platformType}, ${displayText}, ${u.sortOrder}::integer)`;
  });

  await db.execute(
    drizzleSql.join([
      drizzleSql.raw(
        `UPDATE social_links AS t SET url = v.url, platform = v.platform, platform_type = v.platform_type, display_text = v.display_text, sort_order = v.sort_order, updated_at = NOW() FROM (VALUES `
      ),
      drizzleSql.join(rows, drizzleSql`, `),
      drizzleSql.raw(
        `) AS v(id, url, platform, platform_type, display_text, sort_order) WHERE t.id = v.id`
      ),
    ])
  );
}
