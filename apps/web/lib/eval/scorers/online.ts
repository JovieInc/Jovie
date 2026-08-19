import { createHash, randomUUID } from 'node:crypto';
import { captureError } from '@/lib/error-tracking';
import type {
  OnlineScoringInput,
  OnlineScoringResult,
  ScorerResult,
} from './core';
import { runAllScorers } from './core';

export const EVAL_REVIEW_LABEL = 'needs:eval-review' as const;
export const EVAL_REVIEW_KEY_PREFIX = 'eval-review:' as const;
const DEFAULT_SAMPLE_RATE = 0.05;
const softFailureCounts = new Map<string, number>();
let evalReviewStore: EvalReviewStore | null = null;

export interface EvalReviewIncident {
  readonly id: string;
  readonly key: string;
  readonly traceId: string;
  readonly caseName: string;
  readonly failureModes: readonly OnlineScoringResult['failureModes'][number][];
  readonly label: typeof EVAL_REVIEW_LABEL;
  readonly createdAt: string;
}

export interface EvalReviewStore {
  insert(incident: EvalReviewIncident): Promise<string>;
}

export type EvalReviewEnqueueResult = {
  readonly enqueued: boolean;
  readonly label: typeof EVAL_REVIEW_LABEL;
  readonly incidentId?: string;
};

export function evalReviewKey(traceId: string): string {
  return `${EVAL_REVIEW_KEY_PREFIX}${traceId}`;
}

export function createMemoryEvalReviewStore(
  rows: Map<string, EvalReviewIncident> = new Map()
): EvalReviewStore & { readonly rows: Map<string, EvalReviewIncident> } {
  return {
    rows,
    async insert(incident) {
      rows.set(incident.id, incident);
      return incident.id;
    },
  };
}

export function setEvalReviewStore(store: EvalReviewStore | null): void {
  evalReviewStore = store;
}

export function resetOnlineScorerState(): void {
  softFailureCounts.clear();
  evalReviewStore = null;
}

const readSampleRate = () => {
  const parsed = Number.parseFloat(
    process.env.JOVIE_ONLINE_SCORER_SAMPLE_RATE ?? ''
  );
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1
    ? parsed
    : DEFAULT_SAMPLE_RATE;
};

export function shouldSampleProdTrace(
  input: {
    readonly traceId: string;
    readonly durationMs?: number;
    readonly tokenCount?: number;
  },
  options: { readonly sampleRate?: number } = {}
): boolean {
  if ((input.durationMs ?? 0) >= 15_000 || (input.tokenCount ?? 0) >= 4_000)
    return true;
  const sampleRate = options.sampleRate ?? readSampleRate();
  const digest = createHash('sha256')
    .update(`jovie-online-scorer-v1:${input.traceId}`)
    .digest('hex')
    .slice(0, 8);
  return Number.parseInt(digest, 16) / 0xffffffff < sampleRate;
}

const partitionSoftFailures = (
  traceId: string,
  results: readonly ScorerResult[]
): {
  readonly forRecording: ScorerResult[];
  readonly forReview: ScorerResult[];
} => {
  const forRecording: ScorerResult[] = [];
  const forReview: ScorerResult[] = [];
  for (const item of results) {
    if (item.verdict !== 'soft-fail') {
      forRecording.push(item);
      if (item.flagged) forReview.push(item);
      continue;
    }
    const key = `${traceId}:${item.criterion}`;
    const count = (softFailureCounts.get(key) ?? 0) + 1;
    softFailureCounts.set(key, count);
    forRecording.push(item);
    if (count >= 2) {
      const escalated: ScorerResult = {
        ...item,
        verdict: 'fail',
        flagged: true,
        reason: `${item.reason} (recurred ${count}x)`,
      };
      forRecording.push(escalated);
      forReview.push(escalated);
    }
  }
  return { forRecording, forReview };
};

async function persistEvalReviewIncident(
  incident: EvalReviewIncident
): Promise<string> {
  if (evalReviewStore) {
    const id = await evalReviewStore.insert(incident);
    if (!id) {
      throw new Error('eval review store returned no row id');
    }
    return id;
  }

  const { eq } = await import('drizzle-orm');
  const { db } = await import('@/lib/db');
  const { ovieOperatingKv } = await import('@/lib/db/schema/ovie');
  const now = new Date();
  await db
    .insert(ovieOperatingKv)
    .values({ key: incident.key, value: incident, updatedAt: now })
    .onConflictDoUpdate({
      target: ovieOperatingKv.key,
      set: { value: incident, updatedAt: now },
    });
  const rows = await db
    .select({ key: ovieOperatingKv.key })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, incident.key))
    .limit(1);
  if (!rows[0]) {
    throw new Error('eval review persist did not create a durable row');
  }
  return incident.id;
}

export async function enqueueEvalReview(input: {
  readonly traceId: string;
  readonly caseName: string;
  readonly userPrompt: string;
  readonly assistantResponse: string;
  readonly failureModes: readonly OnlineScoringResult['failureModes'][number][];
}): Promise<EvalReviewEnqueueResult> {
  if (input.failureModes.length === 0) {
    return { enqueued: false, label: EVAL_REVIEW_LABEL };
  }

  const incident: EvalReviewIncident = {
    id: randomUUID(),
    key: evalReviewKey(input.traceId),
    traceId: input.traceId,
    caseName: input.caseName,
    failureModes: input.failureModes,
    label: EVAL_REVIEW_LABEL,
    createdAt: new Date().toISOString(),
  };

  try {
    const incidentId = await persistEvalReviewIncident(incident);
    return { enqueued: true, label: EVAL_REVIEW_LABEL, incidentId };
  } catch (error) {
    await captureError('eval review persist failed', error, {
      traceId: input.traceId,
      caseName: input.caseName,
    });
    return { enqueued: false, label: EVAL_REVIEW_LABEL };
  }
}

async function recordScoresInLangfuse(
  traceId: string,
  results: readonly ScorerResult[]
): Promise<void> {
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
    for (const item of results) {
      if (item.verdict === 'absent') continue;
      client.score({
        traceId,
        name: item.criterion,
        value: item.score,
        comment: item.reason,
        dataType: item.criterion.startsWith('rubric-') ? 'NUMERIC' : 'BOOLEAN',
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

export async function runOnlineScoring(
  input: OnlineScoringInput
): Promise<OnlineScoringResult> {
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
    ? await enqueueEvalReview({
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
