import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { computePriorityScore } from '@/lib/leads/priority-score';

describe('computePriorityScore', () => {
  it('returns releaseCount when popularity is 0', () => {
    expect(
      computePriorityScore({
        releaseCount: 50,
        spotifyPopularity: 0,
        latestReleaseDate: null,
      })
    ).toBe(50);
  });

  it('returns 0 when popularity is 100', () => {
    expect(
      computePriorityScore({
        releaseCount: 50,
        spotifyPopularity: 100,
        latestReleaseDate: null,
      })
    ).toBe(0);
  });

  it('scales score by inverse popularity fraction', () => {
    expect(
      computePriorityScore({
        releaseCount: 50,
        spotifyPopularity: 50,
        latestReleaseDate: null,
      })
    ).toBe(25);
  });

  it('applies 1.25x boost for a release within the last 12 months', () => {
    const recentDate = new Date();
    recentDate.setMonth(recentDate.getMonth() - 3);

    expect(
      computePriorityScore({
        releaseCount: 10,
        spotifyPopularity: 30,
        latestReleaseDate: recentDate,
      })
    ).toBe(8.75);
  });

  it('does not boost for a release older than 12 months', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);

    expect(
      computePriorityScore({
        releaseCount: 10,
        spotifyPopularity: 30,
        latestReleaseDate: oldDate,
      })
    ).toBe(7);
  });

  it('returns 0 when releaseCount is 0', () => {
    expect(
      computePriorityScore({
        releaseCount: 0,
        spotifyPopularity: 50,
        latestReleaseDate: null,
      })
    ).toBe(0);
  });
});
