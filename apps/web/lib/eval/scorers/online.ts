import { createHash } from 'node:crypto';

import { failureModeLabel } from '@/lib/eval/failure-modes';

import { runAllScorers } from './core';
import type { OnlineScoringInput, OnlineScoringResult, ScorerResult } from './core';

export const EVAL_REVIEW_LABEL = 'needs:eval-review' as const;
const DEFAULT_SAMPLE_RATE = 0.05;
const softFailureCounts = new Map<string, number>();

export function resetOnlineScorerState(): void {
  softFailureCounts.clear();
}

function readSampleRate(): number {
  const parsed = Number.parseFloat(process.env.JOVIE_ONLINE_SCORER_SAMPLE_RATE ?? '');
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1
    ? parsed
    : DEFAULT_SAMPLE_RATE;
}

export function shouldSampleProdTrace(
  input: { readonly traceId: string; readonly durationMs?: number; readonly tokenCount?: number },
  options: { readonly sampleRate?: number } = {}
): boolean {
  if ((input.durationMs ?? 0) >= 15_000 || (input.tokenCount ?? 0) >= 4_000) {
    return true;
  }
  const sampleRate = options.sampleRate ?? readSampleRate();
  const digest = createHash('sha256')
    .update(`jovie-online-scorer-v1:${input.traceId}`)
    .digest('hex')
    .slice(0, 8);
  return Number.parseInt(digest, 16) / 0xffffffff < sampleRate;
}

function partitionSoftFailures(
  traceId: string,
  results: readonly ScorerResult[]
): { readonly forRecording: readonly ScorerResult[]; readonly forReview: readonly ScorerResult[] } {
  const forRecording: ScorerResult[] = [];
  const forReview: ScorerResult[] = [];

  for (const result of results) {
    if (result.verdict !== 'soft-fail') {
      forRecording.push(result);
      if (result.flagged) forReview.push(result);
      continue;
    }

    const key = `${traceId}:${result.criterion}`;
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

  return { forRecording, forReview };
}

export function buildEvalReviewIssueTitle(input: {
  readonly traceId: string;
  readonly failureModes: readonly OnlineScoringResult['failureModes'][number][];
}): string {
  const modes = input.failureModes.map(failureModeLabel).join(', ');
  return `Eval review: ${input.traceId} (${modes || 'flagged'})`;
}

export function enqueueEvalReview(input: {
  readonly traceId: string;
  readonly caseName: string;
  readonly userPrompt: string;
  readonly assistantResponse: string;
  readonly failureModes: readonly OnlineScoringResult['failureModes'][number][];
}): { readonly enqueued: boolean; readonly label: typeof EVAL_REVIEW_LABEL } {
  return {
    enqueued: input.failureModes.length > 0,
    label: EVAL_REVIEW_LABEL,
  };
}

async function recordScoresInLangfuse(traceId: string, results: readonly ScorerResult[]): Promise<void> {
  if (
    process.env.CI === 'true' ||
    process.env.NODE_ENV === 'test' ||
    !process.env.LANGFUSE_SECRET_KEY ||
    !process.env.LANGFUSE_PUBLIC_KEY
  ) {
    return;
  }

  try {
    const { Langfuse } = await import('langfuse');
    const client = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
      flushAt: 1,
      flushInterval: 1_000,
    });
    for (const result of results) {
      client.score({
        traceId,
        name: result.criterion,
        value: result.score,
        comment: result.reason,
        dataType: result.criterion.startsWith('rubric-') ? 'NUMERIC' : 'BOOLEAN',
      });
    }
    await client.flushAsync();
    await client.shutdownAsync();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'online_scorer_langfuse_export_failed',
        traceId,
        error: error instanceof Error ? error.message : 'unknown',
      })
    );
  }
}

export async function runOnlineScoring(input: OnlineScoringInput): Promise<OnlineScoringResult> {
  if (!shouldSampleProdTrace(input)) {
    return {
      sampled: false,
      results: [],
      flagged: false,
      failureModes: [],
      reviewEnqueued: false,
    };
  }

  const scored = runAllScorers(input);
  const partitioned = partitionSoftFailures(input.traceId, scored.all);
  const flagged = partitioned.forReview.length > 0;
  const failureModes = flagged ? scored.failureModes : [];
  const review = flagged
    ? enqueueEvalReview({
        traceId: input.traceId,
        caseName: input.caseName,
        userPrompt: input.userPrompt,
        assistantResponse: input.assistantResponse,
        failureModes,
      })
    : { enqueued: false, label: EVAL_REVIEW_LABEL };

  void recordScoresInLangfuse(input.traceId, partitioned.forRecording);

  return {
    sampled: true,
    results: partitioned.forRecording,
    flagged,
    failureModes,
    reviewEnqueued: review.enqueued,
  };
}

export function scheduleOnlineScoring(input: OnlineScoringInput): void {
  if (process.env.CI === 'true' || process.env.NODE_ENV === 'test') return;
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