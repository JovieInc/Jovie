import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { applyRlsTransactionUser, db } from '@/lib/db';
import type { DbType, TransactionType } from '@/lib/db/client/types';
import { assertGlobalDbAllowed, atomicDbContext } from './atomic-context';
import { logDbError } from './client/logging';
import { QUERY_TIMEOUTS } from './query-timeout';
import { withSerializableRetry } from './serializable-retry';

type TransactionOptions = Parameters<DbType['transaction']>[1];

/**
 * Audited transaction and rollback boundary.
 *
 * Compatibility entry point for existing wrappers. New multi-statement business
 * operations use runAtomicDbOperation below.
 */
export async function runLegacyDbTransaction<T>(
  operation: (tx: TransactionType) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  let operationError: unknown;
  let operationFailed = false;

  try {
    return await db.transaction(async tx => {
      try {
        return await operation(tx);
      } catch (error) {
        operationError = error;
        operationFailed = true;
        throw error;
      }
    }, options);
  } catch (transactionError) {
    if (!operationFailed || Object.is(transactionError, operationError)) {
      throw transactionError;
    }

    // Drizzle issues ROLLBACK inside its catch block. If that cleanup query
    // also fails, it replaces the operation error with "Failed query:
    // rollback". Keep the cleanup failure as a breadcrumb, but preserve the
    // original exception so callers and Sentry retain the actionable cause.
    logDbError(
      'transaction_rollback_failed',
      transactionError,
      {
        operationErrorMessage:
          operationError instanceof Error
            ? operationError.message
            : String(operationError),
        operationErrorName:
          operationError instanceof Error
            ? operationError.name
            : typeof operationError,
      },
      { asBreadcrumb: true }
    );
    throw operationError;
  }
}

/** Actor IDs must come from authenticated server context, never request fields. */
interface AtomicOperationOptions {
  readonly actorId: string;
  /** Privileged callers must authorize the actor before selecting system RLS. */
  readonly system?: true;
  readonly retry: 'never' | 'serialization';
  readonly isolationLevel?: NonNullable<TransactionOptions>['isolationLevel'];
  readonly timeoutMs?: number;
}

/**
 * Short database-only operation; all protected helpers must use tx.
 * Never replay transport/timeout/ambiguous COMMIT errors. Reconcile durable
 * state/idempotency keys before attempting an uncertain write again (JOV-3775).
 */
export async function runAtomicDbOperation<T>(
  operation: (tx: TransactionType) => Promise<T>,
  options: AtomicOperationOptions
): Promise<T> {
  assertGlobalDbAllowed();
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUTS.api;
  if (
    !options.actorId.trim() ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > QUERY_TIMEOUTS.api
  ) {
    throw new TypeError(
      'Atomic operation requires an actor and positive timeout'
    );
  }
  const deadline = performance.now() + timeoutMs;
  const attempt = () =>
    runLegacyDbTransaction(
      async tx => {
        const remaining = Math.floor(deadline - performance.now());
        if (remaining <= 0)
          throw new Error('Atomic database deadline exceeded');
        await tx.execute(drizzleSql`SELECT
      set_config('statement_timeout', ${String(remaining)}, true),
      set_config('lock_timeout', ${String(Math.min(remaining, 1000))}, true),
      set_config('idle_in_transaction_session_timeout', ${String(remaining)}, true)`);
        await applyRlsTransactionUser(
          tx,
          options.system ? 'system_ingestion' : options.actorId
        );
        return atomicDbContext.run({ actorId: options.actorId }, async () => {
          const result = await operation(tx);
          if (performance.now() >= deadline)
            throw new Error('Atomic database deadline exceeded');
          return result;
        });
      },
      { isolationLevel: options.isolationLevel ?? 'serializable' }
    );
  return options.retry === 'serialization'
    ? withSerializableRetry(attempt)
    : attempt();
}
