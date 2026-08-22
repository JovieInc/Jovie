import { z } from 'zod';
export const OVIE_SHIPPING_STATE_SCHEMA = 'ovie.shipping-state.v1' as const;
const SOURCE_SCHEMAS = {
  symphony: 'symphony-runtime/v1',
  fleet: 'jovie-fleet-gate/v1',
  delivery: 'jovie-delivery/v1',
  issues: 'linear-workflow/v1',
} as const;
type SourceId = keyof typeof SOURCE_SCHEMAS;
const SOURCE_FACTS: Record<SourceId, readonly string[]> = {
  symphony:
    'implementing retrying readyQueue ownerBlocked slotsTotal slotsAvailable'.split(
      ' '
    ),
  fleet:
    'state promotionMode workAllowed newIssueLeaseAllowed promotionAllowed deploymentAllowed'.split(
      ' '
    ),
  delivery:
    'mainSha productionSha exactProduction deployStatus openPullRequests queuedPullRequests successfulCiRuns successfulProductionRuns'.split(
      ' '
    ),
  issues: 'source backlog ready'.split(' '),
};
export const ovieTruthStateSchema = z.enum([
  'fresh',
  'stale',
  'disconnected',
  'unavailable',
  'unauthorized',
  'degraded',
  'unknown',
  'recovery',
]);
export type OvieTruthState = z.infer<typeof ovieTruthStateSchema>;
const truthPriority =
  'unauthorized disconnected unavailable unknown stale degraded recovery fresh'.split(
    ' '
  ) as OvieTruthState[];
const aggregateStatus = (sources: readonly { status: OvieTruthState }[]) =>
  truthPriority.find(status =>
    sources.some(source => source.status === status)
  ) ?? 'unknown';
const timestamp = z.string().datetime();
const sourceId = z.enum(['symphony', 'fleet', 'delivery', 'issues']);
const factKeys = new Set(Object.values(SOURCE_FACTS).flat());
const factKey = z.string().refine(value => factKeys.has(value));
const countFacts = new Set(
  'implementing retrying readyQueue ownerBlocked slotsTotal slotsAvailable openPullRequests queuedPullRequests successfulCiRuns successfulProductionRuns backlog ready'.split(
    ' '
  )
);
const flagFacts = new Set(
  'workAllowed newIssueLeaseAllowed promotionAllowed deploymentAllowed exactProduction'.split(
    ' '
  )
);
function validFact(key: string, value: unknown): boolean {
  if (value === null) return true;
  if (countFacts.has(key))
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  if (flagFacts.has(key)) return typeof value === 'boolean';
  if (['mainSha', 'productionSha'].includes(key))
    return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  if (key === 'state') return ['GREEN', 'AMBER', 'RED'].includes(String(value));
  if (key === 'promotionMode')
    return 'normal isolated-only draft-only hold-intake blocked'
      .split(' ')
      .includes(String(value));
  if (key === 'source') return value === 'linear';
  return (
    key === 'deployStatus' &&
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 40
  );
}
const sourceSchema = z
  .object({
    sourceId,
    schemaVersion: z.string().min(1).max(80),
    status: ovieTruthStateSchema,
    sequence: z.number().int().positive(),
    sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: timestamp,
    freshUntil: timestamp,
    correlationId: z.string().min(1).max(160),
    lastSuccessAt: timestamp.nullable(),
    partial: z.boolean(),
    truncated: z.boolean(),
    lastError: z
      .object({ code: z.string().min(1).max(80), at: timestamp })
      .strict()
      .nullable(),
    facts: z.record(factKey, z.unknown()),
  })
  .strict();
export const ovieShippingProjectionSchema = z
  .object({
    schemaVersion: z.literal(OVIE_SHIPPING_STATE_SCHEMA),
    projectionId: z.string().uuid(),
    previousProjectionId: z.string().uuid().nullable(),
    producerId: z.literal('gem-ubuntu'),
    sequence: z.number().int().positive(),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
    generatedAt: timestamp,
    freshUntil: timestamp,
    correlationId: z.string().min(1).max(160),
    status: ovieTruthStateSchema,
    sources: z.array(sourceSchema).length(4),
  })
  .strict()
  .superRefine((projection, context) => {
    const seen = new Set<string>();
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: 'custom', path, message });
    if (projection.correlationId !== `shipping:${projection.projectionId}`) {
      issue(['correlationId'], 'projection correlation mismatch');
    }
    for (const [index, source] of projection.sources.entries()) {
      const facts = Object.keys(source.facts).sort().join();
      if (seen.has(source.sourceId)) {
        issue(['sources', index], 'duplicate source');
      }
      seen.add(source.sourceId);
      if (source.schemaVersion !== SOURCE_SCHEMAS[source.sourceId]) {
        issue(['sources', index, 'schemaVersion'], 'source schema mismatch');
      }
      if (facts !== [...SOURCE_FACTS[source.sourceId]].sort().join()) {
        issue(['sources', index, 'facts'], 'source facts mismatch');
      }
      if (
        Object.entries(source.facts).some(
          ([key, value]) => !validFact(key, value)
        )
      ) {
        issue(['sources', index, 'facts'], 'source fact type mismatch');
      }
      const partial = Object.values(source.facts).some(value => value === null);
      if (source.partial !== partial) {
        issue(['sources', index, 'partial'], 'source partial mismatch');
      }
      if (partial && ['fresh', 'recovery'].includes(source.status)) {
        issue(['sources', index, 'status'], 'partial source cannot be healthy');
      }
      if (
        Date.parse(source.observedAt) >
          Date.parse(projection.generatedAt) + 5000 ||
        Date.parse(source.freshUntil) < Date.parse(source.observedAt)
      ) {
        issue(['sources', index], 'source time mismatch');
      }
      if (
        source.sequence !== projection.sequence ||
        source.correlationId !== projection.correlationId
      ) {
        issue(['sources', index], 'source lineage mismatch');
      }
    }
    if (
      projection.freshUntil !==
      projection.sources.map(source => source.freshUntil).sort()[0]
    ) {
      issue(['freshUntil'], 'projection freshness mismatch');
    }
    if (projection.status !== aggregateStatus(projection.sources)) {
      issue(['status'], 'projection status mismatch');
    }
  });
export type OvieShippingProjection = z.infer<
  typeof ovieShippingProjectionSchema
>;
export type ProjectionWriteResult = 'accepted' | 'duplicate' | 'conflict';
export function classifyProjectionSuccessor(
  current: OvieShippingProjection | null,
  incoming: OvieShippingProjection
): ProjectionWriteResult {
  if (!current) {
    return incoming.sequence === 1 && incoming.previousProjectionId === null
      ? 'accepted'
      : 'conflict';
  }
  if (
    current.projectionId === incoming.projectionId &&
    current.sequence === incoming.sequence &&
    JSON.stringify(current) === JSON.stringify(incoming)
  ) {
    return 'duplicate';
  }
  return incoming.previousProjectionId === current.projectionId &&
    incoming.sequence === current.sequence + 1
    ? 'accepted'
    : 'conflict';
}
export type OperationalTruthRead = {
  readonly schemaVersion: 'ovie.shipping-state.read.v1';
  readonly status: OvieTruthState;
  readonly reason: 'current' | 'expired' | 'never_received' | 'schema_mismatch';
  readonly projection: OvieShippingProjection | null;
};
function read(
  status: OvieTruthState,
  reason: OperationalTruthRead['reason'],
  projection: OvieShippingProjection | null
): OperationalTruthRead {
  return {
    schemaVersion: 'ovie.shipping-state.read.v1',
    status,
    reason,
    projection,
  };
}
export function projectOperationalTruthForRead(
  stored: unknown,
  currentTime = new Date()
): OperationalTruthRead {
  if (stored === null || stored === undefined) {
    return read('unavailable', 'never_received', null);
  }
  const parsed = ovieShippingProjectionSchema.safeParse(stored);
  if (
    !parsed.success ||
    Date.parse(parsed.data.generatedAt) > currentTime.getTime() + 5000
  ) {
    return read('unknown', 'schema_mismatch', null);
  }
  if (currentTime.getTime() <= Date.parse(parsed.data.freshUntil)) {
    return read(parsed.data.status, 'current', parsed.data);
  }
  const sources = parsed.data.sources.map(source => ({
    ...source,
    status: ['fresh', 'recovery'].includes(source.status)
      ? ('stale' as const)
      : source.status,
  }));
  const status = aggregateStatus(sources);
  const projection = ovieShippingProjectionSchema.parse({
    ...parsed.data,
    status,
    sources,
  });
  return read(status, 'expired', projection);
}
