import { describe, expect, it } from 'vitest';
import {
  assessProfileCompleteness,
  PROFILE_COMPLETENESS_POLICY,
  type ProfileCompletenessJudgment,
  type ProfileCompletenessSnapshot,
  prepareProfileCompleteness,
} from './completeness-certification';

const now = new Date('2026-09-19T20:00:00Z');
const complete: ProfileCompletenessSnapshot = {
  profileId: '11111111-1111-4111-8111-111111111111',
  revision: '1:2026-09-19T19:00:00.000Z',
  username: 'riverlane',
  displayName: 'River Lane',
  avatarUrl: 'https://cdn.jov.ie/river.jpg',
  bio: 'Independent soul artist from Atlanta. Listen to the new EP Northern Lights.',
  destinations: [
    { platform: 'spotify', url: 'https://open.spotify.com/artist/river' },
  ],
  provenance: [
    {
      kind: 'public_source',
      referenceId: 'ingest-1',
      url: 'https://linktr.ee/riverlane',
    },
  ],
};
function judgment(snapshot = complete): ProfileCompletenessJudgment {
  return {
    schemaVersion: PROFILE_COMPLETENESS_POLICY,
    profileId: snapshot.profileId,
    snapshotSha256: prepareProfileCompleteness(snapshot).snapshotSha256,
    policyVersion: PROFILE_COMPLETENESS_POLICY,
    evaluatedAt: now.toISOString(),
    model: 'typesafe-ai/jev',
    transportStatus: 'evaluated',
    verdict: 'supported',
    reasons: ['jev_supported'],
    confidence: null,
  };
}

describe('shared directory and outreach completeness certification', () => {
  it('admits a useful generated unclaimed profile only with matching Jev evidence', () => {
    expect(assessProfileCompleteness(complete, judgment(), now)).toMatchObject({
      eligible: true,
      score: 100,
      reasons: [],
    });
  });
  it.each([
    ['photo', { avatarUrl: null }],
    ['identity', { displayName: 'riverlane' }],
    ['content', { bio: 'Coming soon' }],
    ['destinations', { destinations: [] }],
    ['provenance', { provenance: [] }],
  ] as const)('never lets a model pass override missing %s', (field, patch) => {
    const snapshot = { ...complete, ...patch };
    expect(
      assessProfileCompleteness(snapshot, judgment(snapshot), now)
    ).toMatchObject({
      eligible: false,
      score: 80,
      reasons: [`missing_${field}`],
    });
  });
  it.each([
    'http://example.com/photo.jpg',
    'https://localhost/photo.jpg',
    'https://127.0.0.1/photo.jpg',
    'https://cdn.example.com/default-user.png',
    'https://u:p@example.com/photo.jpg',
  ])('rejects invalid or placeholder photo %s', avatarUrl => {
    expect(
      prepareProfileCompleteness({ ...complete, avatarUrl }).checks.photo
    ).toBe(false);
  });
  it.each([
    'javascript:alert(1)',
    'https://10.0.0.1/path',
    'https://host.internal/path',
  ])('rejects an unsafe destination %s', url => {
    expect(
      prepareProfileCompleteness({
        ...complete,
        destinations: [{ platform: 'website', url }],
      }).checks.destinations
    ).toBe(false);
  });
  it('requires model evidence even for all required fields', () => {
    expect(assessProfileCompleteness(complete, null, now)).toMatchObject({
      score: 100,
      eligible: false,
      reasons: ['evaluation_missing'],
    });
  });
  it.each(['failed', 'not_evaluated'] as const)(
    'rejects %s transport',
    transportStatus => {
      expect(
        assessProfileCompleteness(
          complete,
          { ...judgment(), transportStatus },
          now
        ).eligible
      ).toBe(false);
    }
  );
  it.each(['contradicted', 'insufficient', null] as const)(
    'rejects %s verdict',
    verdict => {
      expect(
        assessProfileCompleteness(complete, { ...judgment(), verdict }, now)
          .eligible
      ).toBe(false);
    }
  );
  it.each([null, 'invalid', '2026-09-18T19:59:59Z', '2026-09-19T20:00:01Z'])(
    'rejects stale or invalid evaluation time %s',
    evaluatedAt => {
      expect(
        assessProfileCompleteness(complete, { ...judgment(), evaluatedAt }, now)
          .reasons
      ).toContain('evaluation_stale');
    }
  );
  it('invalidates evidence when relevant content changes', () => {
    for (const patch of [
      { bio: `${complete.bio} Updated.` },
      { avatarUrl: 'https://cdn.jov.ie/new.jpg' },
      { username: 'newhandle' },
      { destinations: [] },
      { provenance: [] },
    ]) {
      expect(
        assessProfileCompleteness({ ...complete, ...patch }, judgment(), now)
          .reasons
      ).toContain('evaluation_mismatch');
    }
  });
  it('cannot replay another profile or policy receipt', () => {
    expect(
      assessProfileCompleteness(
        complete,
        { ...judgment(), profileId: 'other-profile' },
        now
      ).eligible
    ).toBe(false);
    expect(
      assessProfileCompleteness(
        complete,
        {
          ...judgment(),
          policyVersion: 'old',
        } as unknown as ProfileCompletenessJudgment,
        now
      ).eligible
    ).toBe(false);
  });
  it('sorts evidence deterministically, retaining every source and destination in the digest', () => {
    const snapshot = {
      ...complete,
      destinations: [
        ...complete.destinations,
        { platform: 'website', url: 'https://river.example/about' },
      ],
    };
    expect(prepareProfileCompleteness(snapshot).snapshotSha256).toBe(
      prepareProfileCompleteness({
        ...snapshot,
        destinations: [...snapshot.destinations].reverse(),
      }).snapshotSha256
    );
  });
});
