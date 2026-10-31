import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { execute } }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import {
  getArtistOfferFunnelReport,
  recordArtistOfferStage,
  recordFirstUseComplete,
} from './artist-offer-funnel.server';

/** Flatten a drizzle SQL object to inspectable text (params inlined). */
function sqlText(node: unknown): string {
  const parts: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (value: unknown) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number') {
      parts.push(String(value));
      return;
    }
    if (value instanceof Date) {
      parts.push(value.toISOString());
      return;
    }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if ('value' in record) walk(record.value);
    if ('queryChunks' in record) walk(record.queryChunks);
    if (Array.isArray(value)) for (const item of value) walk(item);
  };
  walk(node);
  return parts.join(' ');
}

describe('getArtistOfferFunnelReport diagnostics', () => {
  beforeEach(() => execute.mockReset());

  it('splits visits by landing and counts stage events in the window', async () => {
    execute
      .mockResolvedValueOnce({ rows: [{ visits: 100 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ offer: 7, other: 93 }] })
      .mockResolvedValueOnce({
        rows: [
          { stage: 'pricing', journeys: 4 },
          { stage: 'claim-start', journeys: 1 },
          { stage: 'not-a-stage', journeys: 9 },
        ],
      })
      // Last: consented journeys first seen in the trailing 7 days.
      .mockResolvedValueOnce({ rows: [{ visits: 40 }] });

    const report = await getArtistOfferFunnelReport({
      start: new Date('2026-10-21T00:00:00Z'),
      end: new Date('2026-10-22T00:00:00Z'),
    });

    expect(report.stages[0]).toMatchObject({ stage: 'visit', journeys: 100 });
    expect(report.stages[1]).toMatchObject({ stage: 'pricing', journeys: 0 });
    expect(report.diagnostics).toEqual({
      visitsByLanding: { offer: 7, other: 93 },
      stageEventsInWindow: { pricing: 4, 'claim-start': 1 },
    });
    expect(execute).toHaveBeenCalledTimes(5);
    expect(report.goldenPath?.stalledStages).toContain('start');
  });

  it('reads zero diagnostics from empty results', async () => {
    execute.mockResolvedValue({ rows: [] });
    const report = await getArtistOfferFunnelReport();
    expect(report.diagnostics).toEqual({
      visitsByLanding: { offer: 0, other: 0 },
      stageEventsInWindow: {},
    });
  });
});

describe('JOV-9957 upgrade_to_first_use happy path', () => {
  const JOURNEY = '3f2e1d0c-0b0a-4901-8203-040506070809';

  beforeEach(() => execute.mockReset());

  it('walks claim → checkout → first-use-started → first-use-complete on one journey key', async () => {
    execute.mockResolvedValue({ rows: [] });

    // 1. Anonymous claim entry (producer: /claim/start route).
    expect(await recordArtistOfferStage(JOURNEY, 'claim-start')).toBe(true);
    // 2. Checkout session created (producer: /api/stripe/checkout).
    expect(await recordArtistOfferStage(JOURNEY, 'checkout')).toBe(true);
    // 3. Buyer lands in the guided welcome conversation
    //    (producer: /api/onboarding/welcome-chat bootstrap).
    expect(await recordArtistOfferStage(JOURNEY, 'first-use-started')).toBe(
      true
    );
    // 4. First agent turn completes (producer: /api/chat onFinish).
    expect(await recordFirstUseComplete(JOURNEY)).toBe(true);

    expect(execute).toHaveBeenCalledTimes(4);
    const statements = execute.mock.calls.map(call => sqlText(call[0]));
    for (const [statement, stage] of [
      [statements[0], 'claim-start'],
      [statements[1], 'checkout'],
      [statements[2], 'first-use-started'],
    ] as const) {
      expect(statement).toContain(JOURNEY);
      expect(statement).toContain(stage);
      expect(statement).toContain(
        'ON CONFLICT (acquisition_id, stage) DO NOTHING'
      );
    }
    // Completion is gated on the journey having started its first use, and
    // carries the same journey key plus its own once-per-journey conflict.
    expect(statements[3]).toContain(JOURNEY);
    expect(statements[3]).toContain("s.stage = 'first-use-started'");
    expect(statements[3]).toContain('first-use-complete');
    expect(statements[3]).toContain(
      'ON CONFLICT (acquisition_id, stage) DO NOTHING'
    );
  });

  it('never records completion without a valid journey id', async () => {
    execute.mockResolvedValue({ rows: [] });
    expect(await recordFirstUseComplete(null)).toBe(false);
    expect(await recordFirstUseComplete('not-a-uuid')).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it('never throws when the stage sink fails', async () => {
    execute.mockRejectedValue(new Error('sink down'));
    expect(await recordArtistOfferStage(JOURNEY, 'first-use-started')).toBe(
      false
    );
    expect(await recordFirstUseComplete(JOURNEY)).toBe(false);
  });
});
