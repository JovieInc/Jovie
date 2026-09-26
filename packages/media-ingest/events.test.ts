import { describe, expect, it } from 'vitest';
import { clusterEvents } from './events';
import type { AssetRecord } from './types';

let seq = 0;
function asset(over: {
  capturedAt: string;
  lat?: number | null;
  lon?: number | null;
  kind?: AssetRecord['kind'];
  subtype?: AssetRecord['subtype'];
}): AssetRecord {
  seq += 1;
  return {
    id: `asset-${seq}`,
    sourcePath: `/src/${seq}`,
    libraryPath: `/lib/${seq}`,
    checksum: { sizeBytes: 1, sha256: String(seq).padStart(64, '0') },
    kind: over.kind ?? 'photo',
    subtype: over.subtype ?? 'photo',
    origin: 'yours',
    originReason: 'test',
    capture: {
      capturedAt: over.capturedAt,
      latitude: over.lat ?? null,
      longitude: over.lon ?? null,
      cameraModel: 'iPhone',
      source: 'exif',
    },
    eventId: null,
    audio: null,
    songId: null,
    transcript: null,
    needsReview: false,
    reviewReasons: [],
    ingestedAt: '2026-09-26T00:00:00.000Z',
  };
}

describe('clusterEvents', () => {
  it('groups an evening geo cluster with video into a show', () => {
    const assets = [
      asset({
        capturedAt: '2026-09-20T21:00:00Z',
        lat: 34.05,
        lon: -118.24,
        kind: 'video',
      }),
      asset({ capturedAt: '2026-09-20T22:00:00Z', lat: 34.051, lon: -118.241 }),
      asset({ capturedAt: '2026-09-20T23:00:00Z', lat: 34.052, lon: -118.24 }),
    ];
    const events = clusterEvents(assets);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('show');
    expect(events[0].confidence).toBe('high');
  });

  it('marks same-day multi-location days as low-confidence travel', () => {
    const assets = [
      asset({ capturedAt: '2026-09-20T10:00:00Z', lat: 34.05, lon: -118.24 }),
      asset({ capturedAt: '2026-09-20T16:00:00Z', lat: 36.16, lon: -115.15 }),
    ];
    const events = clusterEvents(assets);
    expect(events).toHaveLength(2);
    expect(events.every(e => e.confidence === 'low')).toBe(true);
  });

  it('does not invent events: ambiguous days stay unknown', () => {
    const assets = [
      asset({ capturedAt: '2026-09-20T14:00:00Z' }),
      asset({ capturedAt: '2026-09-20T15:00:00Z' }),
    ];
    const events = clusterEvents(assets);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('unknown');
    expect(events[0].confidence).toBe('low');
  });

  it('separates different days into different events', () => {
    const assets = [
      asset({ capturedAt: '2026-09-20T14:00:00Z' }),
      asset({ capturedAt: '2026-09-21T14:00:00Z' }),
    ];
    const events = clusterEvents(assets);
    expect(events).toHaveLength(2);
    expect(events[0].date).toBe('2026-09-20');
    expect(events[1].date).toBe('2026-09-21');
  });
});
