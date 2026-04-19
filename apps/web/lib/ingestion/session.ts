import 'server-only';

import {
  type IsolationLevel,
  setTransactionSessionUserId,
} from '@/lib/auth/session';
import { type DbOrTransaction } from '@/lib/db';
import { runLegacyDbTransaction } from '@/lib/db/legacy-transaction';

export const SYSTEM_INGESTION_USER = 'system_ingestion';

/**
 * Execute an operation with system ingestion session context.
 * Uses the centralized legacy transaction wrapper to preserve behavior while
 * preventing direct app-level transaction calls from spreading.
 */
export async function withSystemIngestionSession<T>(
  operation: (tx: DbOrTransaction) => Promise<T>,
  options?: { isolationLevel?: IsolationLevel }
): Promise<T> {
  return runLegacyDbTransaction(
    async tx => {
      await setTransactionSessionUserId(
        tx,
        SYSTEM_INGESTION_USER,
        'withSystemIngestionSession_set_config_failed'
      );

      return operation(tx);
    },
    options?.isolationLevel
      ? { isolationLevel: options.isolationLevel }
      : undefined
  );
}
