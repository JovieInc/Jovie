import { createHash } from 'node:crypto';
import { z } from 'zod';

const explicitInstant = z.iso.datetime({ offset: true });
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export type Payload = Record<string, unknown>;
export type HistoryEvent = Payload & {
  id: string;
  timestamp: Date | null;
  legacyKey: string | null;
  legacyPayload: Payload | null;
};
export type HistoryKind = 'action' | 'referrer';
const actionKeys = [
  'label',
  'emoji',
  'platform',
  'eventType',
  'verb',
  'confidence',
  'sourceKind',
  'sourceLabel',
  'sourceLinkId',
  'clickEventId',
  'objectType',
  'objectId',
  'objectLabel',
  'properties',
  'context',
];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => compare(a, b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Only explicit offsets prove instants. Missing/null stays null (JOV-3063). */
export function historicalTimestamp(value: unknown): Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/i.test(value)) {
    throw new Error('Unproven historical timestamp; use JOV-3063');
  }
  if (!explicitInstant.safeParse(value).success)
    throw new Error('Invalid historical timestamp');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error('Invalid historical timestamp');
  return date;
}

export function eventProjection(row: HistoryEvent, kind: HistoryKind): Payload {
  if (row.legacyPayload) return { ...row.legacyPayload, eventId: row.id };
  const keys = kind === 'action' ? actionKeys : ['url'];
  const result: Payload = { eventId: row.id };
  for (const key of keys) {
    if (row[key] !== null && row[key] !== undefined) result[key] = row[key];
  }
  if (
    kind === 'action' &&
    typeof (row.properties as Payload | null)?.code === 'string'
  ) {
    result.sourceLinkCode = (row.properties as Payload).code;
  }
  result.timestamp = row.timestamp?.toISOString() ?? null;
  return result;
}

function sameFields(payload: Payload, event: HistoryEvent, kind: HistoryKind) {
  const keys = kind === 'action' ? actionKeys : ['url', 'source'];
  if (
    kind === 'action' &&
    payload.action !== undefined &&
    payload.label === undefined &&
    payload.action !== event.label
  )
    return false;
  return keys.every(key => {
    if (!(key in payload)) return true;
    return canonical(payload[key]) === canonical(event[key]);
  });
}

/** One-to-one multiset reconciliation: identical repeated events retain multiplicity. */
export function reconcileHistory(
  original: Payload[] | null,
  current: Payload[] | null,
  events: HistoryEvent[],
  kind: HistoryKind,
  memberId: string
) {
  const entries = new Map<string, Payload>();
  for (const history of [original, current]) {
    if (history !== null && !Array.isArray(history))
      throw new Error('Invalid history array');
    if (
      (history?.length ?? 0) > 1000 ||
      Buffer.byteLength(JSON.stringify(history)) > 262144
    ) {
      throw new Error('History exceeds bounded conversion budget');
    }
    const occurrences = new Map<string, number>();
    for (const payload of history ?? []) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('Invalid history entry');
      const { eventId: _, ...content } = payload;
      const hash = createHash('sha256')
        .update(canonical(content))
        .digest('hex');
      const occurrence = (occurrences.get(hash) ?? 0) + 1;
      occurrences.set(hash, occurrence);
      entries.set(`${kind}:v1:${hash}:${occurrence}`, payload);
    }
  }
  const used = new Set<string>();
  const updates: HistoryEvent[] = [];
  const inserts: HistoryEvent[] = [];
  const rows = events
    .map(row => ({ ...row }))
    .sort((a, b) => compare(a.id, b.id));
  for (const [key, payload] of entries) {
    const label = payload.label ?? payload.action;
    if (kind === 'action' && (typeof label !== 'string' || !label))
      throw new Error('Missing historical action label');
    if (
      kind === 'referrer' &&
      (typeof payload.url !== 'string' || !payload.url)
    )
      throw new Error('Missing historical referrer URL');
    const time = historicalTimestamp(payload.timestamp);
    const timeMatches = (row: HistoryEvent) =>
      (row.timestamp?.getTime() ?? null) === (time?.getTime() ?? null);
    let row = rows.find(event => event.legacyKey === key);
    if (!row && typeof payload.eventId === 'string') {
      row = rows.find(event => event.id === payload.eventId);
      if (!row || !timeMatches(row) || !sameFields(payload, row, kind))
        throw new Error('Invalid event provenance');
      // A current projection can reference an event already reconciled from the snapshot.
      if (used.has(row.id)) continue;
      used.add(row.id);
      continue;
    }
    row ??= rows.find(
      event =>
        !used.has(event.id) &&
        !event.legacyKey &&
        timeMatches(event) &&
        sameFields(payload, event, kind)
    );
    if (!row) {
      if (
        events.some(
          event =>
            !event.legacyKey &&
            sameFields(payload, event, kind) &&
            !timeMatches(event)
        )
      ) {
        throw new Error('Ambiguous historical dual write; retain fallback');
      }
      row = {
        id: historicalEventId(memberId, key),
        timestamp: time,
        legacyKey: key,
        legacyPayload: payload,
        ...(kind === 'action'
          ? { label, eventType: 'legacy' }
          : { url: payload.url, source: payload.source ?? null }),
      };
      rows.push(row);
      inserts.push(row);
    } else if (!row.legacyKey) {
      row.legacyKey = key;
      row.legacyPayload = payload;
      updates.push(row);
    }
    used.add(row.id);
  }
  // NULL times sort last. Equal instants use UUID, never ingestion or array order.
  rows.sort(
    (a, b) =>
      (b.timestamp?.getTime() ?? -Infinity) -
        (a.timestamp?.getTime() ?? -Infinity) || compare(a.id, b.id)
  );
  return {
    inserts,
    updates,
    reconciled: entries.size,
    projection: rows
      .slice(0, kind === 'action' ? 5 : 3)
      .map(row => eventProjection(row, kind)),
  };
}

function historicalEventId(memberId: string, key: string) {
  const hex = createHash('sha256').update(`${memberId}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
