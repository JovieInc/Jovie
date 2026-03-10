import 'server-only';

import { db } from '@/lib/db';
import type { DbOrTransaction, DbType } from '@/lib/db/client/types';

type TransactionOptions = Parameters<DbType['transaction']>[1];

/**
 * Legacy-only transaction wrapper.
 *
 * Canonical policy: avoid introducing new app-level `db.transaction()` usage.
 * Keep all unavoidable transaction usage centralized in this module so the
 * remaining exceptions are explicit and easy to audit.
 */
export async function runLegacyDbTransaction<T>(
  operation: (tx: DbOrTransaction) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  return db.transaction(async tx => operation(tx), options);
}
