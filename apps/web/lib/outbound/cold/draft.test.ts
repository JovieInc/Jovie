import { describe, expect, it } from 'vitest';
import {
  type ColdArtifactFacts,
  composeColdSequence,
  isRecentRelease,
} from './draft';

const NOW = new Date('2026-10-29T12:00:00Z');
const CLAIM = 'https://jov.ie/claim/agent/7f1c0d1e-0000-4000-8000-000000000001';

function facts(overrides: Partial<ColdArtifactFacts> = {}): ColdArtifactFacts {
  return {
    artistName: 'Nova Lane',
    firstName: null,
    claimUrl: CLAIM,
    artifact: 'release_page',
    latestRelease: { title: 'Low Tide', releasedOn: '2026-10-10' },
    platformCount: 6,
    releaseCount: 9,
    ...overrides,
  };
}

// En and em dashes, built from code points so this file carries none.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const SALES =
  /\b(free trial|limited|exclusive|unlock|boost|grow your|game[- ]chang|revolution|amazing|excited|opportunit|schedule a call|demo)\b/i;

describe('composeColdSequence', () => {
  it('leads with what was built and one true catalog detail', () => {
    const draft = composeColdSequence(facts(), NOW);
    const first = draft.steps[0];
    expect(first?.subject).toBe('Low Tide');
    expect(first?.body).toContain(
      'I made a page for "Low Tide", your October release.'
    );
    expect(first?.body).toContain('(6 services)');
    expect(draft.claims.map(c => c.fact)).toEqual(
      expect.arrayContaining(['latestRelease', 'platformCount'])
    );
  });

  it('has exactly one link per step and signs as Tim', () => {
    for (const step of composeColdSequence(facts(), NOW).steps) {
      expect(step.body.match(/https?:\/\//g)).toHaveLength(1);
      expect(step.body.trim().endsWith('Tim')).toBe(true);
    }
  });

  it('passes the founder-tim copy floor and avoids sales words and dashes', () => {
    for (const variant of [
      facts(),
      facts({ artifact: 'profile', latestRelease: null }),
      facts({ firstName: 'Ada', platformCount: 1, releaseCount: 1 }),
    ]) {
      const draft = composeColdSequence(variant, NOW);
      expect(draft.lint).toEqual([]);
      for (const step of draft.steps) {
        expect(step.body).not.toMatch(SALES);
        expect(step.body).not.toMatch(DASHES);
      }
    }
  });

  it('only names a release when it is recent; otherwise talks about the catalog', () => {
    const draft = composeColdSequence(
      facts({ latestRelease: { title: 'Old One', releasedOn: '2025-01-01' } }),
      NOW
    );
    expect(draft.steps[0]?.body).not.toContain('Old One');
    expect(draft.steps[0]?.body).toContain('with your 9 releases');
  });

  it('names a recent release on a profile-only artifact too', () => {
    const draft = composeColdSequence(facts({ artifact: 'profile' }), NOW);
    expect(draft.steps[0]?.subject).toBe('Nova Lane page');
    expect(draft.steps[0]?.body).toContain('"Low Tide" is on it.');
  });

  it('turns the second touch into a check-in when there is nothing new to add', () => {
    const draft = composeColdSequence(facts({ artifact: 'profile' }), NOW);
    expect(draft.steps[1]?.body).toContain('Checking you saw this.');
  });

  it('never invents a first name from the artist name', () => {
    expect(
      composeColdSequence(facts(), NOW).steps[0]?.body.startsWith('Hey,')
    ).toBe(true);
    expect(
      composeColdSequence(
        facts({ firstName: 'Ada' }),
        NOW
      ).steps[0]?.body.startsWith('Hey Ada,')
    ).toBe(true);
  });

  it('promises to stop in the last step', () => {
    expect(composeColdSequence(facts(), NOW).steps.at(-1)?.body).toContain(
      "I won't email again."
    );
  });
});

describe('isRecentRelease', () => {
  it('ignores future and malformed dates', () => {
    expect(isRecentRelease({ title: 'x', releasedOn: '2027-01-01' }, NOW)).toBe(
      false
    );
    expect(isRecentRelease({ title: 'x', releasedOn: 'soon' }, NOW)).toBe(
      false
    );
    expect(isRecentRelease(null, NOW)).toBe(false);
  });
});
