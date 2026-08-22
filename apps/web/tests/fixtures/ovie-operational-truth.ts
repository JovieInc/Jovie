import {
  OVIE_SHIPPING_STATE_SCHEMA,
  type OvieShippingProjection,
  ovieShippingProjectionSchema,
} from '@/lib/ovie/operational-truth';
export function shippingProjection(
  overrides: Partial<OvieShippingProjection> = {}
): OvieShippingProjection {
  const projectionId = overrides.projectionId ?? crypto.randomUUID();
  const sequence = overrides.sequence ?? 1;
  const correlationId = `shipping:${projectionId}`;
  const generatedAt = '2026-08-22T03:00:00.000Z';
  const freshUntil = overrides.freshUntil ?? '2026-08-22T03:00:05.000Z';
  const status = overrides.status ?? 'fresh';
  const meta = {
    status,
    sequence,
    sourceRevision: 'a'.repeat(64),
    observedAt: generatedAt,
    freshUntil,
    correlationId,
    lastSuccessAt: generatedAt,
    partial: false,
    truncated: false,
    lastError: null,
  };
  const source = (
    sourceId: string,
    schemaVersion: string,
    facts: Record<string, unknown>
  ) => ({ ...meta, sourceId, schemaVersion, facts });
  return ovieShippingProjectionSchema.parse({
    schemaVersion: OVIE_SHIPPING_STATE_SCHEMA,
    projectionId,
    previousProjectionId: null,
    producerId: 'gem-ubuntu',
    sequence,
    sourceRevision: 'b'.repeat(40),
    generatedAt,
    freshUntil,
    correlationId,
    status,
    sources: [
      source(
        'symphony',
        'symphony-runtime/v1',
        Object.fromEntries(
          'implementing retrying readyQueue ownerBlocked slotsTotal slotsAvailable'
            .split(' ')
            .map(key => [key, 0])
        )
      ),
      source('fleet', 'jovie-fleet-gate/v1', {
        state: 'GREEN',
        promotionMode: 'normal',
        workAllowed: true,
        newIssueLeaseAllowed: true,
        promotionAllowed: true,
        deploymentAllowed: true,
      }),
      source('delivery', 'jovie-delivery/v1', {
        mainSha: 'b'.repeat(40),
        productionSha: 'b'.repeat(40),
        exactProduction: true,
        deployStatus: 'healthy',
        openPullRequests: 0,
        queuedPullRequests: 0,
        successfulCiRuns: 0,
        successfulProductionRuns: 0,
      }),
      source('issues', 'linear-workflow/v1', {
        source: 'linear',
        backlog: 0,
        ready: 0,
      }),
    ],
    ...overrides,
  });
}
