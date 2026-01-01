/**
 * Database Type Guards
 *
 * Type guard functions for database query results.
 */

import type { ActiveConnectionsRow, TableExistsRow } from './types';

/**
 * Check if a value is a record (object)
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard for table existence query result
 */
export function isTableExistsRow(value: unknown): value is TableExistsRow {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.table_exists === 'boolean';
}

/**
 * Type guard for active connections query result
 */
export function isActiveConnectionsRow(
  value: unknown
): value is ActiveConnectionsRow {
  if (!isRecord(value)) {
    return false;
  }

  const activeConnections = value.active_connections;
  return (
    typeof activeConnections === 'string' ||
    typeof activeConnections === 'number'
  );
}
