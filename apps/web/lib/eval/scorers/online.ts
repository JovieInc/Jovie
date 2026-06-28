/**
 * Online scorer lane — async Langfuse scoring on sampled prod traffic.
 */

import { shouldEnableLangfuse } from '@/lib/observability/langfuse';

import { runAllScorers } from './deterministic';
import { createLinearEvalReviewIssue, enqueueEvalReview } from './review-queue';
import { shouldSampleProdTrace } from './sampling';
import {
  aggregateScoreObservations,
  applyBucketSmoothing,
  detectScoreAnomalies,
  toScoreObservations,
} from './timeseries';
import type {
  OnlineScoringInput,
  OnlineScoringResult,
  ScoreObservation,
  ScorerResult,
  TimeSeriesGranularity,
} from './types';

const scoreHistory: ScoreObservation[] = [];
const softFailureCounts = new Map<string, number>();

export function resetOnlineScorerState(): void {
  scoreHistory.length = 0;
  softFailureCounts.clear();
}

export function getOnlineScoreHistory(): readonly ScoreObservation[] {
  return scoreHistory;
}

function buildSoftFailureKey(traceId: string, criterion: string): string {
  return `${traceId}:${criterion}`;
}

function partitionScorerResults(
  traceId: string,
  results: readonly ScorerResult[]
): {
  readonly forRecording: readonly ScorerResult[];
  readonly forReview: readonly ScorerResult[];
  readonly flagged: boolean;
} {
  const forRecording: ScorerResult[] = [];
  const forReview: ScorerResult[] = [];

  for (const result of results) {
    if (result.verdict !== 'soft-fail') {
      forRecording.push(result);
      if (result.flagged) {
        forReview.push(result);
      }
      continue;
    }

    const key = buildSoftFailureKey(traceId, result.criterion);
    const count = (softFailureCounts.get(key) ?? 0) + 1;
    softFailureCounts.set(key, count);

    forRecording.push(result);

    if (count >= 2) {
      const escalated: ScorerResult = {
        ...result,
        verdict: 'fail',
        flagged: true,
        reason: `${result.reason} (recurred ${count}x)`,
      };
      forRecording.push(escalated);
      forReview.push(escalated);
    }
  }

  return {
    forRecording,
    forReview,
    flagged: forReview.length > 0,
  };
}

async function recordScoresInLangfuse(params: {
  readonly traceId: string;
  readonly results: readonly ScorerResult[];
}): Promise<void> {
  if (!shouldEnableLangfuse()) return;

  try {
    const { Langfuse } = await import('langfuse');
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    if (!secretKey || !publicKey) return;

    const client = new Langfuse({
      secretKey,
      publicKey,
      baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
      flushAt: 1,
      flushInterval: 1_000,
    });

    for (const result of params.results) {
      client.score({
        traceId: params.traceId,
        name: result.criterion,
        value: result.score,
        comment: result.reason,
        dataType: result.criterion.startsWith('rubric-')
          ? 'NUMERIC'
          : 'BOOLEAN',
      });
    }

    await client.flushAsync();
    await client.shutdownAsync();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'online_scorer_langfuse_export_failed',
        traceId: params.traceId,
        error: error instanceof Error ? error.message : 'unknown',
      })
    );
  }
}

export function buildOnlineDashboard(
  observations: readonly ScoreObservation[],
  granularity: TimeSeriesGranularity = 'hourly'
) {
  const buckets = aggregateScoreObservations(observations, granularity);
  const smoothed = applyBucketSmoothing(buckets);
  const anomalies = detectScoreAnomalies(smoothed);

  return {
    granularity,
    buckets: smoothed,
    anomalies,
  };
}

export async function runOnlineScoring(
  input: OnlineScoringInput,
  options: {
    readonly linearApiKey?: string;
    readonly linearTeamId?: string;
    readonly now?: string;
  } = {}
): Promise<OnlineScoringResult> {
  const sampled = shouldSampleProdTrace({
    traceId: input.traceId,
    durationMs: input.durationMs,
    tokenCount: input.tokenCount,
    plan: input.plan,
  });

  if (!sampled) {
    return {
      sampled: false,
      results: [],
      flagged: false,
      failureModes: [],
      reviewEnqueued: false,
      anomalies: [],
    };
  }

  const scored = runAllScorers(input);
  const partitioned = partitionScorerResults(input.traceId, scored.all);
  const flagged = partitioned.flagged;
  const failureModes = flagged ? scored.failureModes : [];

  const timestamp = options.now ?? new Date().toISOString();
  const observations = toScoreObservations(
    partitioned.forRecording,
    input.traceId,
    timestamp
  );
  scoreHistory.push(...observations);

  const dashboard = buildOnlineDashboard(scoreHistory, 'hourly');

  let reviewEnqueued = false;
  if (flagged) {
    const queue = enqueueEvalReview({
      traceId: input.traceId,
      caseName: input.caseName,
      userPrompt: input.userPrompt,
      assistantResponse: input.assistantResponse,
      failureModes,
      flaggedAt: timestamp,
    });
    reviewEnqueued = queue.enqueued;

    const linearIssue = await createLinearEvalReviewIssue({
      apiKey: options.linearApiKey ?? process.env.LINEAR_API_KEY,
      teamId: options.linearTeamId ?? process.env.LINEAR_EVAL_REVIEW_TEAM_ID,
      input: {
        traceId: input.traceId,
        caseName: input.caseName,
        userPrompt: input.userPrompt,
        assistantResponse: input.assistantResponse,
        failureModes,
        flaggedAt: timestamp,
      },
    });

    if (linearIssue) {
      reviewEnqueued = true;
    }
  }

  void recordScoresInLangfuse({
    traceId: input.traceId,
    results: partitioned.forRecording,
  });

  return {
    sampled: true,
    results: partitioned.forRecording,
    flagged,
    failureModes,
    reviewEnqueued,
    anomalies: dashboard.anomalies,
  };
}

/**
 * Fire-and-forget hook for chat routes — scoring must not block responses.
 */
export function scheduleOnlineScoring(input: OnlineScoringInput): void {
  if (process.env.CI === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }

  void runOnlineScoring(input).catch(error => {
    console.warn(
      JSON.stringify({
        event: 'online_scorer_failed',
        traceId: input.traceId,
        error: error instanceof Error ? error.message : 'unknown',
      })
    );
  });
}
