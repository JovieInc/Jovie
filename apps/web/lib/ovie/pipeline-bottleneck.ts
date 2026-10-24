import { z } from 'zod';

export const PIPELINE_BOTTLENECK_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const PIPELINE_CONTRIBUTION_MAX_BYTES = 16 * 1024;
export const PIPELINE_BOTTLENECK_PATH = 'summer-bottleneck/current.json';
export const PIPELINE_CONTRIBUTION_PATH =
  'summer-bottleneck/contributions/hourly-loop.json';
export const PIPELINE_BOTTLENECK_API = '/api/internal/ovie/pipeline-bottleneck';

const text = z.string().trim().min(1);
const linkUrl = z.url({ protocol: /^https?$/u }).max(2048);
const rank1Schema = z.object({
  id: text,
  title: text,
  oneLine: text.max(140),
});
const costSchema = z.object({
  item: text,
  monthlyUsd: z.number().finite().nonnegative(),
});
const metricsSchema = z.record(
  text,
  z.object({ value: z.number().finite(), unit: text, label: text })
);

export const pipelineBottleneckSchema = z
  .object({
    schema: z.literal('pipeline-bottleneck/v1'),
    observedAt: z.iso.datetime({ offset: true }),
    status: z.enum(['agentic', 'needs-you', 'clear']),
    rank1: rank1Schema.nullable(),
    owner: text.nullable(),
    dispatchRef: text.nullable(),
    cost: costSchema.nullable(),
    impact: text.nullable(),
    statusLink: linkUrl.optional(),
    metric: text.max(140).optional(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .superRefine((data, ctx) => {
    if ((data.status === 'clear') !== (data.rank1 === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['rank1'],
        message: 'Active status requires rank1; clear requires null',
      });
    }
    if (data.status === 'needs-you' && (!data.cost || !data.impact)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cost'],
        message: 'Needs-you requires cost and impact',
      });
    }
  });

export const pipelineBottleneckContributionSchema = z.object({
  schema: z.literal('pipeline-bottleneck-contribution/v1'),
  observedAt: z.iso.datetime({ offset: true }),
  metrics: metricsSchema,
  rank1Override: rank1Schema.optional(),
  status: z.literal('needs-you').optional(),
  cost: costSchema.optional(),
  impact: text.optional(),
  statusLink: linkUrl.optional(),
  metric: text.max(140).optional(),
});

export const mergedPipelineBottleneckSchema =
  pipelineBottleneckSchema.safeExtend({
    metrics: metricsSchema,
  });
export type PipelineBottleneck = z.infer<typeof pipelineBottleneckSchema>;
export type PipelineBottleneckContribution = z.infer<
  typeof pipelineBottleneckContributionSchema
>;
export type MergedPipelineBottleneck = z.infer<
  typeof mergedPipelineBottleneckSchema
>;

export function isPipelineBottleneckFresh(
  observedAt: string,
  now: number
): boolean {
  const age = now - Date.parse(observedAt);
  return age >= 0 && age <= PIPELINE_BOTTLENECK_MAX_AGE_MS;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Deterministic projection; the caller supplies the clock. No storage or network. */
export async function mergePipelineBottleneck(
  summerInput: unknown,
  contributionInput: unknown,
  now: number
): Promise<MergedPipelineBottleneck | null> {
  const summer = pipelineBottleneckSchema.safeParse(summerInput);
  if (
    !summer.success ||
    !isPipelineBottleneckFresh(summer.data.observedAt, now)
  )
    return null;

  const parsed =
    pipelineBottleneckContributionSchema.safeParse(contributionInput);
  const contribution =
    parsed.success && isPipelineBottleneckFresh(parsed.data.observedAt, now)
      ? parsed.data
      : null;
  const rank1 = contribution?.rank1Override ?? summer.data.rank1;
  const override =
    contribution?.status === 'needs-you' &&
    contribution.cost &&
    contribution.impact &&
    rank1 &&
    now - Date.parse(contribution.observedAt) < PIPELINE_BOTTLENECK_MAX_AGE_MS;
  const { sourceDigest: _sourceDigest, ...source } = summer.data;
  const body = {
    ...source,
    ...(override
      ? {
          status: 'needs-you' as const,
          rank1,
          cost: contribution.cost,
          impact: contribution.impact,
          // The override replaces the ranked bottleneck, so Summer's link and
          // metric must not survive attached to the loop's escalation.
          statusLink: contribution.statusLink,
          metric: contribution.metric,
          // Never attribute a loop escalation to Summer's unrelated repair owner.
          owner: null,
          dispatchRef: null,
          // Both authorities must remain fresh while the projection is cached.
          observedAt: new Date(
            Math.min(
              Date.parse(source.observedAt),
              Date.parse(contribution.observedAt)
            )
          ).toISOString(),
        }
      : {}),
    metrics: contribution?.metrics ?? {},
  };
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(body))
  );
  const sourceDigest = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return { ...body, sourceDigest };
}
