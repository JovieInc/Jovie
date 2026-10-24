import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { execute } }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { getArtistOfferFunnelReport } from './artist-offer-funnel.server';

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
      });

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
    expect(execute).toHaveBeenCalledTimes(4);
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
