import 'server-only';
import {
  createContentVersion,
  getLiveContent,
  publishContentVersion,
} from '@/lib/content-records/store.server';
import { captureError } from '@/lib/error-tracking';
import {
  PROOF_STATS_EVENT_LIMIT,
  PROOF_STATS_KEY,
  PROOF_STATS_KIND,
  type ProofStatEvent,
  type ProofStatsRecord,
} from './content-kind';
import {
  crossedMilestones,
  type ProofStatObservation,
  type ResolvedProofStat,
  resolveProofStat,
} from './format';
import { measureProductionStat } from './queries.server';
import {
  getProofStat,
  listProofStats,
  PROOF_STAT_REGISTRY,
  type ProofStatDefinition,
} from './registry';

const HOUR_MS = 60 * 60 * 1000;
const RESTAMP_AFTER_MS = 6 * HOUR_MS;
export async function getProofStatsRecord(): Promise<{
  readonly record: ProofStatsRecord;
  readonly versionId: string | null;
}> {
  const live = await getLiveContent(PROOF_STATS_KIND, PROOF_STATS_KEY);
  return { record: live.data, versionId: live.versionId };
}
export async function getPublicProofStat(
  id: string,
  now = new Date()
): Promise<ResolvedProofStat | null> {
  const definition = getProofStat(id);
  if (!definition) return null;
  const { record } = await getProofStatsRecord();
  return resolveProofStat(definition, record.observations[id], {
    now,
    surface: 'public',
  });
}
export async function getPublicProofStats(
  ids: readonly string[],
  now = new Date()
): Promise<Record<string, ResolvedProofStat>> {
  const { record } = await getProofStatsRecord();
  const out: Record<string, ResolvedProofStat> = {};
  for (const id of ids) {
    const definition = getProofStat(id);
    if (!definition) continue;
    out[id] = resolveProofStat(definition, record.observations[id], {
      now,
      surface: 'public',
    });
  }
  return out;
}
export interface ProofStatUpdate {
  readonly id: string;
  readonly observation: ProofStatObservation;
}
function eventId(parts: readonly (string | number)[]): string {
  return parts
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9_:.-]/gu, '-');
}
export function publishableIds(
  record: Pick<ProofStatsRecord, 'observations'>,
  now: Date
): string[] {
  return listProofStats()
    .filter(
      definition =>
        resolveProofStat(definition, record.observations[definition.id], {
          now,
          surface: 'internal',
        }).state === 'publishable'
    )
    .map(definition => definition.id);
}
export function diffProofStats(
  previous: ProofStatsRecord,
  next: Pick<ProofStatsRecord, 'observations'>,
  now: Date
): ProofStatEvent[] {
  const events: ProofStatEvent[] = [];
  const at = now.toISOString();
  const wasPublishable = new Set(previous.publishable);
  for (const definition of listProofStats()) {
    const before = previous.observations[definition.id];
    const after = next.observations[definition.id];
    if (after && definition.milestones) {
      for (const milestone of crossedMilestones(
        PROOF_STAT_REGISTRY.milestones,
        before?.value ?? null,
        after.value
      )) {
        events.push({
          id: eventId(['milestone', definition.id, milestone]),
          type: 'milestone',
          statId: definition.id,
          value: milestone,
          reason: null,
          at,
        });
      }
    }
    const state = resolveProofStat(definition, after, {
      now,
      surface: 'internal',
    }).state;
    const was = wasPublishable.has(definition.id);
    if (!was && state === 'publishable' && after) {
      events.push({
        id: eventId(['published', definition.id, after.measuredAt]),
        type: 'published',
        statId: definition.id,
        value: after.value,
        reason: null,
        at,
      });
    } else if (was && state !== 'publishable') {
      events.push({
        id: eventId(['withdrawn', definition.id, state, at]),
        type: 'withdrawn',
        statId: definition.id,
        value: after?.value ?? before?.value ?? 0,
        reason: state,
        at,
      });
    }
  }
  return events;
}
function needsWrite(
  before: ProofStatObservation | undefined,
  after: ProofStatObservation
): boolean {
  if (!before) return true;
  if (before.value !== after.value) return true;
  if ((before.receipt ?? null) !== (after.receipt ?? null)) return true;
  if ((before.approval?.cardId ?? null) !== (after.approval?.cardId ?? null))
    return true;
  return (
    Date.parse(after.measuredAt) - Date.parse(before.measuredAt) >=
    RESTAMP_AFTER_MS
  );
}
export interface RecordResult {
  readonly written: boolean;
  readonly versionId: string | null;
  readonly changed: readonly string[];
  readonly events: readonly ProofStatEvent[];
}
/** Publish changed observations; carry approval only while the value is unchanged. */
export async function recordProofObservations(
  updates: readonly ProofStatUpdate[],
  input: {
    readonly actor: string;
    readonly reason: string;
    readonly now?: Date;
  }
): Promise<RecordResult> {
  const now = input.now ?? new Date();
  const { record: previous } = await getProofStatsRecord();
  const observations = { ...previous.observations };
  const changed: string[] = [];
  for (const update of updates) {
    const before = observations[update.id];
    const carried =
      update.observation.approval ??
      (before && before.value === update.observation.value
        ? before.approval
        : null);
    const after: ProofStatObservation = {
      ...update.observation,
      approval: carried ?? null,
    };
    if (needsWrite(before, after)) {
      observations[update.id] = after;
      changed.push(update.id);
    }
  }
  const publishable = publishableIds({ observations }, now);
  const draft: ProofStatsRecord = {
    schemaVersion: 1,
    observations,
    publishable,
    events: previous.events,
  };
  const events = diffProofStats(previous, draft, now);
  const publishableChanged =
    publishable.join(',') !== [...previous.publishable].join(',');
  if (changed.length === 0 && events.length === 0 && !publishableChanged) {
    return { written: false, versionId: null, changed, events };
  }
  const seen = new Set(previous.events.map(event => event.id));
  const next: ProofStatsRecord = {
    ...draft,
    events: [
      ...previous.events,
      ...events.filter(event => !seen.has(event.id)),
    ].slice(-PROOF_STATS_EVENT_LIMIT),
  };
  const version = await createContentVersion(PROOF_STATS_KIND, {
    key: PROOF_STATS_KEY,
    data: next,
    author: input.actor,
    note: input.reason,
  });
  await publishContentVersion(PROOF_STATS_KIND, {
    key: PROOF_STATS_KEY,
    versionId: version.id,
    actor: input.actor,
    reason: input.reason,
  });
  return { written: true, versionId: version.id, changed, events };
}
function productionStats(): ProofStatDefinition[] {
  return listProofStats().filter(
    stat =>
      stat.source.kind === 'production' &&
      (stat.status === 'live' || stat.status === 'measuring')
  );
}
/** Hourly measurement also withdraws stale stats and expires their cached pages. */
export async function refreshProofStats(now = new Date()): Promise<{
  readonly measured: number;
  readonly failed: readonly string[];
  readonly written: boolean;
  readonly events: number;
}> {
  const updates: ProofStatUpdate[] = [];
  const failed: string[] = [];
  for (const stat of productionStats()) {
    try {
      const value = await measureProductionStat(stat.source.ref);
      updates.push({
        id: stat.id,
        observation: {
          value,
          measuredAt: now.toISOString(),
          source: 'cron:proof-stats',
          receipt: null,
        },
      });
    } catch (error) {
      failed.push(stat.id);
      await captureError('Proof stat measurement failed', error, {
        route: 'lib/proof-stats',
        statId: stat.id,
      });
    }
  }
  const result = await recordProofObservations(updates, {
    actor: 'agent:proof-stats',
    reason: `hourly refresh: ${updates.length} measured`,
    now,
  });
  return {
    measured: updates.length,
    failed,
    written: result.written,
    events: result.events.length,
  };
}
