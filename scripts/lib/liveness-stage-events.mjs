/**
 * jovie-stage-event/v1 rows for one automation run — split from
 * scripts/lib/automation-registry.mjs (size-500 budgets are shrink-only, so
 * growth extracts a module instead).
 *
 * One `started` row (entered at the run's start, exited at its end) and one
 * terminal `finished` row per run, so every observed run's start and end land
 * in the stage-timing pipeline (docs/metrics/stage-manifest.json entity
 * `automation-run`, shared contract in scripts/lib/stage-events.mjs). A run
 * without a start or end time yields no rows; timestamps are never invented.
 */
import { STAGE_EVENT_SCHEMA } from './stage-events.mjs';

export const RUN_ENTITY_TYPE = 'automation-run';

const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;

/**
 * Run receipts for one run: `started` (entered at start, exited at end) and
 * the terminal `finished`.
 */
export function runStageEvents({
  automationId,
  runRef,
  startedAt,
  endedAt,
  outcome,
  sourceReceipt,
  actor = null,
}) {
  const start = Date.parse(startedAt ?? '');
  const end = Date.parse(endedAt ?? '');
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !nonEmpty(sourceReceipt)
  )
    return [];
  const entityId = `${automationId}@${runRef}`;
  const exit = new Date(Math.max(start, end)).toISOString();
  return [
    {
      schema: STAGE_EVENT_SCHEMA,
      entityType: RUN_ENTITY_TYPE,
      entityId,
      stage: 'started',
      enteredAt: new Date(start).toISOString(),
      exitedAt: exit,
      actor,
      outcome: 'advanced',
      sourceReceipt,
    },
    {
      schema: STAGE_EVENT_SCHEMA,
      entityType: RUN_ENTITY_TYPE,
      entityId,
      stage: 'finished',
      enteredAt: exit,
      exitedAt: exit,
      actor,
      outcome: outcome === 'failed' ? 'failed' : 'completed',
      sourceReceipt,
    },
  ];
}
