import { logDbError } from './logging';
import type { TransactionType } from './types';

interface TransactionFailure {
  readonly error: unknown;
}

interface ConnectionState {
  rollbackFailure?: TransactionFailure;
}

/** Keep Drizzle's transaction lifecycle, but never replace its original failure. */
export async function preserveTransactionErrors<T>(
  tx: TransactionType,
  operation: (tx: TransactionType) => Promise<T>,
  connection: ConnectionState = {}
): Promise<T> {
  let failure: TransactionFailure | undefined;
  let operationFinished = false;

  tx.execute = new Proxy(tx.execute, {
    apply(target, receiver, args) {
      const query = Reflect.apply(target, receiver, args) as ReturnType<
        TransactionType['execute']
      >;
      if (!operationFinished) return query;

      // After the callback, Drizzle executes COMMIT (or RELEASE SAVEPOINT),
      // then ROLLBACK in its catch. Observe execution, keeping PgRaw lazy and
      // preserving the complete Drizzle error, including its query and cause.
      const execute = query.execute.bind(query);
      query.execute = async () => {
        try {
          return await execute();
        } catch (error) {
          if (!failure) {
            failure = { error };
            throw error;
          }

          connection.rollbackFailure ??= failure;
          logDbError(
            'transaction_rollback_failed',
            error,
            {
              operationErrorMessage:
                failure.error instanceof Error
                  ? failure.error.message
                  : String(failure.error),
              operationErrorName:
                failure.error instanceof Error
                  ? failure.error.name
                  : typeof failure.error,
            },
            { asBreadcrumb: true }
          );
          throw failure.error;
        }
      };
      return query;
    },
  });

  const transaction = tx.transaction.bind(tx);
  tx.transaction = nestedOperation =>
    transaction(nestedTx =>
      preserveTransactionErrors(nestedTx, nestedOperation, connection)
    );

  try {
    const result = await operation(tx);
    // A caller may catch a nested failure. Failed savepoint cleanup still
    // poisons the connection: abort the outer transaction and discard it.
    if (connection.rollbackFailure) throw connection.rollbackFailure.error;
    return result;
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    operationFinished = true;
  }
}
