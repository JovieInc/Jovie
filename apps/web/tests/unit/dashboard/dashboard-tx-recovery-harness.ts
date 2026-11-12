/**
 * Minimal shared transaction harness for the dashboard commit-recovery
 * regression tests (JOV-12096 / JOV-12188).
 */

export type QueryOutcome = () => { rows?: unknown[]; error?: unknown };

export type TxState = { closed: boolean; rolledBack: boolean };

type HarnessState = {
  outcomes: QueryOutcome[];
  txStates: TxState[];
  commitFailures: Map<number, QueryOutcome>;
  setupFailures: Map<number, QueryOutcome>;
};

const state: HarnessState = {
  outcomes: [],
  txStates: [],
  commitFailures: new Map(),
  setupFailures: new Map(),
};

export const ok =
  (rows: unknown[]): QueryOutcome =>
  () => ({ rows });

export const fail =
  (error: unknown): QueryOutcome =>
  () => ({ error });

export function resetTxHarness(): void {
  state.outcomes.length = 0;
  state.txStates.length = 0;
  state.commitFailures.clear();
  state.setupFailures.clear();
}

export function queueDashboardReads(): void {
  state.outcomes.push(
    ok([
      {
        id: 'user_db_1',
        email: 'user@example.com',
        activeProfileId: 'profile_1',
      },
    ]),
    ok([
      {
        id: 'profile_1',
        userId: 'user_db_1',
        username: 'tim',
        usernameNormalized: 'tim',
        displayName: 'Tim White',
        avatarUrl: 'https://example.com/avatar.jpg',
        isPublic: true,
        onboardingCompletedAt: new Date('2026-07-20T00:00:00.000Z'),
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      },
    ]),
    ok([{ sidebarCollapsed: false }]),
    ok([{ count: 0 }]),
    ok([{ count: 0 }]),
    ok([{ hasLinks: true, hasMusicLinks: true }]),
    ok([{ width: 1024, height: 1024 }]),
    ok([{ totalReceived: 100, monthReceived: 50, tipsSubmitted: 2 }]),
    ok([{ total: 3, qr: 1, link: 2 }])
  );
}

/**
 * Queue an extra select outcome that only the retried transaction consumes:
 * a failed commit discards its read, so the fresh attempt needs its own
 * queued rows. Inserted just before the tipping-stats outcomes.
 */
export function queueRetriedReadOutcome(
  rows: unknown[] | QueryOutcome,
  position = 7
): void {
  const outcome: QueryOutcome = typeof rows === 'function' ? rows : ok(rows);
  state.outcomes.splice(position, 0, outcome);
}

export const txHarness = state;

export async function withDbSessionTx(
  handler: (tx: unknown, sessionUserId: string) => Promise<unknown>
): Promise<unknown> {
  const txState: TxState = { closed: false, rolledBack: false };
  const transactionIndex = state.txStates.length;
  state.txStates.push(txState);
  try {
    const setupError = state.setupFailures.get(transactionIndex)?.().error;
    if (setupError) {
      throw setupError;
    }
    const tx = {
      select: () => {
        // Annotated so the fallback widens to QueryOutcome; the un-annotated
        // form infers a narrower { rows: ... } union member that makes
        // result.error a TS2339 (same trap the pinned original baselines).
        const outcome: QueryOutcome =
          state.outcomes.shift() ?? (() => ({ rows: [] }));
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.from = chain;
        builder.where = chain;
        builder.limit = chain;
        builder.orderBy = chain;
        // Thenable: drizzle query builders are awaited directly.
        builder.then = (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => {
          let settled: Promise<unknown>;
          try {
            const result = outcome();
            if (result.error) {
              settled = Promise.reject(result.error);
            } else {
              settled = Promise.resolve(result.rows ?? []);
            }
          } catch (error) {
            settled = Promise.reject(error);
          }
          return settled.then(onFulfilled, onRejected);
        };
        return builder;
      },
    };
    const result = await handler(tx, 'user_123');
    const commitError = state.commitFailures.get(transactionIndex)?.().error;
    if (commitError) {
      // Drizzle's post-callback COMMIT failed on the wire; the wrapper
      // discards the client and preserves the original error (JOV-8641).
      throw commitError;
    }
    return result;
  } catch (error) {
    txState.rolledBack = true;
    throw error;
  } finally {
    txState.closed = true;
  }
}

export function capturedCascadeErrors(errors: unknown[]): unknown[] {
  return errors.filter(
    error =>
      error instanceof Error &&
      /25P02|current transaction is aborted|set_config\('statement_timeout'/.test(
        error.message
      )
  );
}
