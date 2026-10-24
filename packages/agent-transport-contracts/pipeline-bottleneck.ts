import { z } from 'zod';

export const PIPELINE_BOTTLENECK_SCHEMA = 'pipeline-bottleneck/v1' as const;
export const GOLDEN_PATH_SENTRY_WEIGHT = 1000;

const count = z.number().int().nonnegative();
const timestamp = z.iso.datetime({ offset: true });
const record = z.record(z.string(), z.unknown());

export const goldenPathSentrySchema = z.object({
  score: z.number().min(0).max(100),
  unresolved_issues: count,
  users_affected_24h: count,
  top_issue: z
    .object({ title: z.string().min(1), flow: z.string().min(1), users: count })
    .nullable(),
  checked_at: timestamp,
});

/** Legacy producer fields stay opaque and lossless until their owner types them. */
export const pipelineBottleneckSchema = z.looseObject({
  schema: z
    .literal(PIPELINE_BOTTLENECK_SCHEMA)
    .default(PIPELINE_BOTTLENECK_SCHEMA),
  ts: z.union([timestamp, z.number().nonnegative()]),
  metrics: record,
  ranking: z.array(record),
  unmeasured: z.array(z.unknown()),
  golden_path_sentry: goldenPathSentrySchema.optional(),
  watcher_health: record.optional(),
});

export type GoldenPathSentry = z.infer<typeof goldenPathSentrySchema>;
export type PipelineBottleneck = z.infer<typeof pipelineBottleneckSchema>;

/** Missing, corrupt, or incompatible snapshots are unavailable, never healthy. */
export function parsePipelineBottleneck(
  input: unknown
): PipelineBottleneck | null {
  try {
    const result = pipelineBottleneckSchema.safeParse(
      typeof input === 'string' ? JSON.parse(input) : input
    );
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function goldenPathSentryBottleneck(
  sentry: GoldenPathSentry | undefined,
  weight = GOLDEN_PATH_SENTRY_WEIGHT
) {
  if (
    !sentry ||
    (sentry.unresolved_issues === 0 && sentry.users_affected_24h === 0)
  ) {
    return null;
  }
  return {
    id: 'golden_path_sentry',
    weight,
    score: sentry.score,
    title: 'Golden-path Sentry regressions',
    detail: `${sentry.score}/100 · ${sentry.unresolved_issues} unresolved issues · ${sentry.users_affected_24h} users affected in 24h${sentry.top_issue ? ` · ${sentry.top_issue.flow}: ${sentry.top_issue.title} (${sentry.top_issue.users} users)` : ''} · Checked ${sentry.checked_at}`,
    checked_at: sentry.checked_at,
  };
}

/** Customer regressions have highest priority, regardless of legacy numeric weights. */
export function rankPipelineBottlenecks(state: PipelineBottleneck) {
  const legacy = state.ranking.filter(
    entry => entry.id !== 'golden_path_sentry'
  );
  const topWeight = legacy.reduce(
    (maximum, entry) =>
      typeof entry.weight === 'number' && Number.isFinite(entry.weight)
        ? Math.max(maximum, entry.weight)
        : maximum,
    GOLDEN_PATH_SENTRY_WEIGHT - 1
  );
  const sentry = goldenPathSentryBottleneck(
    state.golden_path_sentry,
    topWeight + 1
  );
  return sentry ? [sentry, ...legacy] : legacy;
}
