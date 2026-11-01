/**
 * Stage events for content-record changes (`marketing-change` entity in
 * `docs/metrics/stage-manifest.json`). Pure: callers pass rows read from
 * `content_record_versions` and `content_record_events`; the producer that
 * publishes the NDJSON feed owns the I/O.
 *
 * Edit-to-live for a data change = `data-live.enteredAt - data-edit.enteredAt`
 * (a draft is stored, then a publish or rollback moves the live pointer).
 * Code changes are timed by the `shipping` entity (pr-open to verified), so
 * the two are directly comparable, and the share of marketing changes that
 * shipped as data is `dataShare()`.
 */

export interface VersionRow {
  readonly id: string;
  readonly kind: string;
  readonly recordKey: string;
  readonly version: number;
  readonly author: string;
  readonly createdAt: Date;
}

export interface PointerEventRow {
  readonly id: string;
  readonly kind: string;
  readonly recordKey: string;
  readonly action: string;
  readonly toVersionId: string;
  readonly actor: string;
  readonly createdAt: Date;
}

export interface StageEvent {
  readonly schema: 'jovie-stage-event/v1';
  readonly entityType: 'marketing-change';
  readonly entityId: string;
  readonly stage: 'data-edit' | 'data-live';
  readonly enteredAt: string;
  readonly exitedAt: string | null;
  readonly actor: string | null;
  readonly outcome: 'advanced' | 'completed' | 'open';
  readonly sourceReceipt: string;
}

const entityId = (v: VersionRow) => `${v.kind}/${v.recordKey}@${v.version}`;

export function buildContentStageEvents(
  versions: readonly VersionRow[],
  events: readonly PointerEventRow[]
): StageEvent[] {
  const liveByVersion = new Map<string, PointerEventRow>();
  for (const event of [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )) {
    // The first pointer move to a version is its edit-to-live time.
    if (!liveByVersion.has(event.toVersionId)) {
      liveByVersion.set(event.toVersionId, event);
    }
  }
  const out: StageEvent[] = [];
  for (const version of versions) {
    const live = liveByVersion.get(version.id);
    const receipt = `content-record-version:${version.id}`;
    out.push({
      schema: 'jovie-stage-event/v1',
      entityType: 'marketing-change',
      entityId: entityId(version),
      stage: 'data-edit',
      enteredAt: version.createdAt.toISOString(),
      exitedAt: live ? live.createdAt.toISOString() : null,
      actor: version.author,
      outcome: live ? 'advanced' : 'open',
      sourceReceipt: receipt,
    });
    if (live) {
      out.push({
        schema: 'jovie-stage-event/v1',
        entityType: 'marketing-change',
        entityId: entityId(version),
        stage: 'data-live',
        enteredAt: live.createdAt.toISOString(),
        exitedAt: null,
        actor: live.actor,
        outcome: 'completed',
        sourceReceipt: `content-record-event:${live.id}`,
      });
    }
  }
  return out;
}

/** Seconds from draft to live for every version that went live. */
export function editToLiveSeconds(events: readonly StageEvent[]): number[] {
  return events
    .filter(e => e.stage === 'data-edit' && e.exitedAt !== null)
    .map(
      e => (Date.parse(e.exitedAt as string) - Date.parse(e.enteredAt)) / 1000
    );
}

/** Share of marketing changes that shipped as data (0 to 1, null if none). */
export function dataShare(
  dataPublishes: number,
  marketingCodePrs: number
): number | null {
  const total = dataPublishes + marketingCodePrs;
  return total === 0 ? null : dataPublishes / total;
}
