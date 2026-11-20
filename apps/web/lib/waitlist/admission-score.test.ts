import { describe, expect, it } from 'vitest';
import { isOutrankedByQueue, scoreAdmissionCandidate } from './admission-score';
import { compareRankedRows, readAdmissionScore } from './ranked-queue';

const now = new Date('2026-10-25T12:00:00.000Z');
const base = {
  identityResolved: true,
  followers: 3_200,
  popularity: 30,
  catalogReleases: null,
  latestReleaseAt: null,
  releaseStage: null,
  chatTurns: 1,
} as const;

describe('scoreAdmissionCandidate', () => {
  it('scores an unresolved identity at zero identity points', () => {
    expect(
      scoreAdmissionCandidate({ ...base, identityResolved: false }, now)
        .components.identity
    ).toBe(0);
  });

  it('ranks a bigger audience, an active release and a finished chat higher', () => {
    const quiet = scoreAdmissionCandidate(base, now);
    const strong = scoreAdmissionCandidate(
      {
        ...base,
        followers: 40_000,
        popularity: 55,
        releaseStage: 'ongoing_rollout',
        chatTurns: 4,
      },
      now
    );
    expect(strong.score).toBeGreaterThan(quiet.score);
    expect(strong.components.intent).toBe(20);
  });

  it('caps every component and the total at 100', () => {
    const top = scoreAdmissionCandidate(
      {
        identityResolved: true,
        followers: 10_000_000,
        popularity: 100,
        catalogReleases: 99,
        latestReleaseAt: '2026-10-01T00:00:00.000Z',
        releaseStage: 'just_released',
        chatTurns: 9,
      },
      now
    );
    expect(top.components).toEqual({
      identity: 30,
      audience: 30,
      catalog: 20,
      intent: 20,
    });
    expect(top.score).toBe(100);
  });

  it('lists catalog as unmeasured instead of scoring it as a judgment', () => {
    const score = scoreAdmissionCandidate(base, now);
    expect(score.unmeasured).toEqual(['catalog']);
    expect(score.components.catalog).toBe(0);
  });

  it('rewards catalog size and a release in the last 180 days once measured', () => {
    const fresh = scoreAdmissionCandidate(
      {
        ...base,
        catalogReleases: 6,
        latestReleaseAt: '2026-08-01T00:00:00.000Z',
      },
      now
    );
    const stale = scoreAdmissionCandidate(
      {
        ...base,
        catalogReleases: 6,
        latestReleaseAt: '2024-01-01T00:00:00.000Z',
      },
      now
    );
    expect(fresh.components.catalog).toBe(16);
    expect(stale.components.catalog).toBe(6);
    expect(fresh.unmeasured).toEqual([]);
  });

  it('is versioned and carries every input', () => {
    const score = scoreAdmissionCandidate(base, now);
    expect(score.version).toBe('admission-score/v1');
    expect(score.inputs).toEqual(base);
  });
});

describe('isOutrankedByQueue (top N of the day)', () => {
  it('admits when fewer pending entrants than slots', () => {
    expect(
      isOutrankedByQueue({
        candidateScore: 10,
        pendingScoresDesc: [90, 80],
        remainingSlots: 3,
      })
    ).toBe(false);
  });

  it('holds a candidate that N pending entrants outrank', () => {
    expect(
      isOutrankedByQueue({
        candidateScore: 50,
        pendingScoresDesc: [90, 80, 70],
        remainingSlots: 3,
      })
    ).toBe(true);
  });

  it('admits at or above the Nth pending score and holds when no slot is left', () => {
    expect(
      isOutrankedByQueue({
        candidateScore: 70,
        pendingScoresDesc: [90, 80, 70],
        remainingSlots: 3,
      })
    ).toBe(false);
    expect(
      isOutrankedByQueue({
        candidateScore: 99,
        pendingScoresDesc: [],
        remainingSlots: 0,
      })
    ).toBe(true);
  });
});

describe('ranked queue helpers', () => {
  it('sorts best first, unscored last, ties by longest waiting', () => {
    const rows = [
      { score: null, waitlistedAt: '2026-10-01' },
      { score: 40, waitlistedAt: '2026-10-05' },
      { score: 40, waitlistedAt: '2026-10-02' },
      { score: 70, waitlistedAt: '2026-10-09' },
    ];
    expect([...rows].sort(compareRankedRows).map(r => r.score)).toEqual([
      70,
      40,
      40,
      null,
    ]);
    expect([...rows].sort(compareRankedRows)[1].waitlistedAt).toBe(
      '2026-10-02'
    );
  });

  it('reads a stored score and ignores malformed ones', () => {
    const stored = scoreAdmissionCandidate(base, now);
    expect(readAdmissionScore({ admissionScore: stored })?.score).toBe(
      stored.score
    );
    expect(readAdmissionScore({ admissionScore: { score: 'x' } })).toBeNull();
    expect(readAdmissionScore(null)).toBeNull();
  });
});
