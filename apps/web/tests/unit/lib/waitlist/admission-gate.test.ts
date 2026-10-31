import { describe, expect, it } from 'vitest';
import type { ProdGoldenPathLedger } from '@/lib/ovie/certifications/prod-golden-path-ledger';
import {
  DESIGN_JUDGE_LEDGER_SCHEMA,
  type DesignJudgeLedger,
  decideAdmission,
  parseDesignJudgeLedger,
} from '@/lib/waitlist/admission-gate';
import {
  PROFILE_CERT_RECEIPT_SCHEMA,
  type ProfileCertReceipt,
} from '@/lib/waitlist/profile-certification';

const SHA = 'a'.repeat(40);
const OLD = 'b'.repeat(40);
const SURFACES = ['landing', 'onboarding'] as const;

function profile(
  overrides: Partial<ProfileCertReceipt> = {}
): ProfileCertReceipt {
  return {
    schema: PROFILE_CERT_RECEIPT_SCHEMA,
    profileId: 'p1',
    waitlistEntryId: 'e1',
    status: 'passed',
    sha: SHA,
    trigger: 'manual',
    startedAt: '2026-10-29T10:00:00.000Z',
    endedAt: '2026-10-29T10:00:01.000Z',
    checks: [{ id: 'artist_match', status: 'passed', summary: 'ok' }],
    remediation: [],
    evidence: null,
    ...overrides,
  };
}

function goldenPath(sha = SHA, status = 'passed'): ProdGoldenPathLedger {
  const surfaces = Object.fromEntries(
    SURFACES.map(id => [
      id,
      { latest: { surface: id, status, sha }, lastPassedSha: sha, history: [] },
    ])
  );
  return { surfaces } as unknown as ProdGoldenPathLedger;
}

function design(
  overrides: Partial<DesignJudgeLedger['surfaces'][string]> = {},
  currentFingerprint = 'fp1'
): DesignJudgeLedger {
  return {
    schema: DESIGN_JUDGE_LEDGER_SCHEMA,
    currentFingerprint,
    requiredSurfaces: [...SURFACES],
    surfaces: Object.fromEntries(
      SURFACES.map(id => [
        id,
        {
          verdict: 'pass',
          sourceSha: SHA,
          fingerprint: 'fp1',
          judgedAt: '2026-10-29T10:00:00.000Z',
          ...overrides,
        },
      ])
    ),
  };
}

function decide(input: Partial<Parameters<typeof decideAdmission>[0]> = {}) {
  return decideAdmission({
    prodSha: SHA,
    profileReceipt: profile(),
    goldenPath: goldenPath(),
    goldenPathSurfaces: SURFACES,
    design: design(),
    ...input,
  });
}

describe('decideAdmission', () => {
  it('admits only when all three legs are certified on the production SHA', () => {
    expect(decide()).toMatchObject({ admit: true, blocking: [] });
  });

  it('fails closed on a missing design judge ledger (the judge pipeline is not live yet)', () => {
    expect(decide({ design: null })).toMatchObject({
      admit: false,
      blocking: ['design'],
    });
  });

  it('treats a deploy as invalidating every leg certified on the old SHA', () => {
    const result = decide({
      profileReceipt: profile({ sha: OLD }),
      goldenPath: goldenPath(OLD),
      design: design({ sourceSha: OLD }),
    });
    expect(result.blocking).toEqual(['profile', 'golden_path', 'design']);
  });

  it('treats a judge model or rubric change as invalidating the design sign-off', () => {
    expect(decide({ design: design({}, 'fp2') }).blocking).toEqual(['design']);
  });

  it('never counts a judge fail as a sign-off', () => {
    expect(decide({ design: design({ verdict: 'fail' }) }).blocking).toEqual([
      'design',
    ]);
  });

  it('blocks on a failed golden-path surface and names it', () => {
    const result = decide({ goldenPath: goldenPath(SHA, 'failed') });
    expect(result.blocking).toEqual(['golden_path']);
    expect(result.legs[1]?.reason).toContain('landing');
  });

  it('blocks a person without a passed profile receipt', () => {
    expect(decide({ profileReceipt: null }).blocking).toEqual(['profile']);
    const unconfirmed = decide({
      profileReceipt: profile({
        status: 'needs_artist_confirmation',
        checks: [{ id: 'artist_match', status: 'failed', summary: 'x' }],
      }),
    });
    expect(unconfirmed.legs[0]?.reason).toContain('artist_match');
  });

  it('blocks everything when the production SHA is unknown', () => {
    expect(decide({ prodSha: null }).blocking).toEqual([
      'profile',
      'golden_path',
      'design',
    ]);
  });
});

describe('parseDesignJudgeLedger', () => {
  it('reads a valid ledger from JSON and rejects anything malformed', () => {
    expect(parseDesignJudgeLedger(JSON.stringify(design()))).not.toBeNull();
    expect(parseDesignJudgeLedger('{not json')).toBeNull();
    expect(parseDesignJudgeLedger({ schema: 'other' })).toBeNull();
    expect(parseDesignJudgeLedger(null)).toBeNull();
  });
});
