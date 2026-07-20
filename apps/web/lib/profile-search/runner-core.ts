import {
  type ClassifiableSurface,
  type ClassifiedSearchResult,
  classifySearchResults,
} from './classification';
import {
  type ProfileSearchProvider,
  ProfileSearchProviderError,
  type ProfileSearchRequest,
  type ProfileSearchResponse,
} from './provider';

const MAX_SCHEDULED_RUNS = 10;
const MAX_RETRY_ATTEMPTS = 4;
const STOP_CLAIMING_MARGIN_MS = 15_000;

export interface ClaimedProfileSearchQuery {
  readonly id: string;
  readonly request: ProfileSearchRequest;
}

export interface ProfileSearchRunnerDependencies {
  readonly provider: ProfileSearchProvider;
  isRolloutEnabled(): Promise<boolean>;
  isProviderHealthy(): Promise<boolean>;
  claimDueQuery(): Promise<ClaimedProfileSearchQuery | null>;
  createAttemptIntent(
    queryId: string,
    kind: 'scheduled' | 'retry'
  ): Promise<string>;
  reserveAttemptBudget(
    attemptId: string,
    kind: 'scheduled' | 'retry'
  ): Promise<boolean>;
  markAttemptIssued(attemptId: string): Promise<void>;
  loadSurfaces(queryId: string): Promise<readonly ClassifiableSurface[]>;
  completeSuccess(input: {
    readonly attemptId: string;
    readonly queryId: string;
    readonly response: ProfileSearchResponse;
    readonly results: readonly ClassifiedSearchResult[];
  }): Promise<void>;
  completeFailure(input: {
    readonly attemptId: string;
    readonly queryId: string;
    readonly code: string;
    readonly message: string;
  }): Promise<void>;
  markProviderSuccess(): Promise<void>;
  markProviderFailure(code: string): Promise<void>;
}

export interface ProfileSearchRunnerStats {
  readonly enabled: boolean;
  readonly claimed: number;
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly retried: number;
  readonly skippedBudget: number;
  readonly stoppedForDeadline: boolean;
}

function failureDetails(error: unknown) {
  if (error instanceof ProfileSearchProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  return {
    code: 'unexpected',
    message: error instanceof Error ? error.message : 'Unknown provider error',
    retryable: false,
  };
}

export async function runProfileSearchBatch(
  dependencies: ProfileSearchRunnerDependencies,
  options: { readonly deadlineAt: number; readonly now?: () => number }
): Promise<ProfileSearchRunnerStats> {
  const now = options.now ?? Date.now;
  const rolloutEnabled = await dependencies.isRolloutEnabled();
  const providerHealthy =
    rolloutEnabled && (await dependencies.isProviderHealthy());
  const stats = {
    enabled: rolloutEnabled && providerHealthy,
    claimed: 0,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    retried: 0,
    skippedBudget: 0,
    stoppedForDeadline: false,
  };
  if (!stats.enabled) return stats;

  while (stats.claimed < MAX_SCHEDULED_RUNS) {
    if (options.deadlineAt - now() < STOP_CLAIMING_MARGIN_MS) {
      stats.stoppedForDeadline = true;
      break;
    }
    const query = await dependencies.claimDueQuery();
    if (!query) break;
    stats.claimed += 1;

    let kind: 'scheduled' | 'retry' = 'scheduled';
    while (true) {
      const attemptId = await dependencies.createAttemptIntent(query.id, kind);
      const reserved = await dependencies.reserveAttemptBudget(attemptId, kind);
      if (!reserved) {
        stats.skippedBudget += 1;
        await dependencies.completeFailure({
          attemptId,
          queryId: query.id,
          code: 'budget_exhausted',
          message: 'Profile search budget exhausted',
        });
        break;
      }

      await dependencies.markAttemptIssued(attemptId);
      stats.attempted += 1;
      try {
        const response = await dependencies.provider.search(query.request);
        const surfaces = await dependencies.loadSurfaces(query.id);
        const results = classifySearchResults(
          response.organicResults,
          surfaces
        );
        await dependencies.completeSuccess({
          attemptId,
          queryId: query.id,
          response,
          results,
        });
        await dependencies.markProviderSuccess();
        stats.succeeded += 1;
        break;
      } catch (error) {
        const failure = failureDetails(error);
        await dependencies.completeFailure({
          attemptId,
          queryId: query.id,
          code: failure.code,
          message: failure.message,
        });
        await dependencies.markProviderFailure(failure.code);
        const canRetry =
          failure.retryable &&
          stats.retried < MAX_RETRY_ATTEMPTS &&
          options.deadlineAt - now() >= STOP_CLAIMING_MARGIN_MS;
        if (!canRetry) {
          stats.failed += 1;
          break;
        }
        stats.retried += 1;
        kind = 'retry';
      }
    }
  }

  return stats;
}
