import { describe, expect, it } from 'vitest';
import {
  type HistoryEvent,
  historicalTimestamp,
  reconcileHistory,
} from './audience-history';

const instant = '2020-11-01T01:30:00-04:00';
const event = (id: string, extra = {}): HistoryEvent => ({
  id,
  label: 'Played',
  timestamp: new Date(instant),
  legacyKey: null,
  legacyPayload: null,
  ...extra,
});
const plan = (
  original: Record<string, unknown>[] | null,
  current = original,
  events: HistoryEvent[] = [],
  kind: 'action' | 'referrer' = 'action'
) => reconcileHistory(original, current, events, kind, 'member');

describe('audience historical provenance', () => {
  it('matches dual writes one-to-one and imports only the remaining multiplicity', () => {
    const payload = {
      label: 'Played',
      timestamp: instant,
      unknown: { keep: ['all'] },
    };
    const result = plan([payload, payload, payload], undefined, [
      event('b'),
      event('a'),
    ]);
    expect(result.updates.map(row => row.id)).toEqual(['a', 'b']);
    expect(result.inserts).toHaveLength(1);
    expect(result.inserts[0].legacyPayload).toEqual(payload);
    expect(result.updates[0].legacyPayload).toEqual(payload);
    const persisted = [...result.updates, ...result.inserts];
    const replay = plan(
      [payload, payload, payload],
      result.projection,
      persisted
    );
    expect(replay.inserts).toEqual([]);
    expect(replay.updates).toEqual([]);
    expect(replay.projection).toEqual(result.projection);
    expect(
      plan([payload, payload, payload], undefined, [event('a'), event('b')])
        .inserts[0].id
    ).toBe(result.inserts[0].id);
  });

  it('uses locale-independent canonical keys and matches only valid history shapes', () => {
    const first = plan([{ label: 'x', metadata: { z: 1, A: 2, ä: 3 } }]);
    const replay = plan(
      [{ metadata: { ä: 3, A: 2, z: 1 }, label: 'x' }],
      undefined,
      first.inserts
    );
    expect(replay.inserts).toEqual([]);
    expect(replay.projection).toEqual(first.projection);
    expect(() =>
      plan([{}], undefined, [event('null', { timestamp: null })])
    ).toThrow('label');
  });

  it('preserves seed shape, absent/null times and every unknown property across bounds', () => {
    const payloads = Array.from({ length: 8 }, (_, i) => ({
      action: `seed-${i}`,
      timestamp: i < 2 ? null : `2020-01-0${i}T00:00:00Z`,
      custom: { i },
    }));
    const result = plan([...payloads, { action: 'missing-time' }]);
    expect(result.inserts).toHaveLength(9);
    expect(result.projection).toHaveLength(5);
    expect(result.projection[0]).toMatchObject({
      action: 'seed-7',
      custom: { i: 7 },
    });
    expect(result.inserts.filter(row => row.timestamp === null)).toHaveLength(
      3
    );
    const refs = plan(
      [
        { url: 'x', extra: 1 },
        { url: 'x', timestamp: null },
      ],
      undefined,
      [],
      'referrer'
    );
    expect(refs.inserts.map(row => row.timestamp)).toEqual([null, null]);
    expect(refs.projection.find(row => row.extra === 1)).not.toHaveProperty(
      'timestamp'
    );
    expect(plan(null).projection).toEqual([]);
  });

  it('orders equal instants and NULLs deterministically and derives explicit provenance', () => {
    const events = [event('z', { timestamp: null }), event('b'), event('a')];
    const result = plan([], [], events);
    expect(result.projection.map(row => row.eventId)).toEqual(['a', 'b', 'z']);
    expect(plan(result.projection, result.projection, events).inserts).toEqual(
      []
    );
    expect(() =>
      plan([{ eventId: 'foreign', label: 'Played' }], undefined, events)
    ).toThrow('provenance');
    expect(() =>
      plan(
        [{ eventId: 'a', label: 'Different', timestamp: instant }],
        undefined,
        events
      )
    ).toThrow('provenance');
  });

  it('refuses unproven timestamps, ambiguous clock drift and malformed/budget-exceeding history', () => {
    expect(historicalTimestamp(null)).toBeNull();
    expect(historicalTimestamp(instant)?.toISOString()).toBe(
      '2020-11-01T05:30:00.000Z'
    );
    for (const timestamp of [
      '2020-11-01T01:30:00',
      'invalidZ',
      '2020-02-31T00:00:00Z',
      3,
    ]) {
      expect(() => historicalTimestamp(timestamp)).toThrow();
    }
    expect(() =>
      plan(
        [{ label: 'Played', timestamp: '2020-11-01T05:30:05.000Z' }],
        undefined,
        [event('a')]
      )
    ).toThrow('Ambiguous');
    expect(() => plan([{}])).toThrow('label');
    expect(() => plan([{}], undefined, [], 'referrer')).toThrow('URL');
    expect(() => plan(Array.from({ length: 1001 }, () => ({})))).toThrow(
      'budget'
    );
    expect(() => plan([{ label: 'x', huge: 'x'.repeat(262144) }])).toThrow(
      'budget'
    );
  });
});
