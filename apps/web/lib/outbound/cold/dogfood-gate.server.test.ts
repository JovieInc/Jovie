import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DogfoodJudgeLedgerValue } from '@/lib/agent-os/dogfood-judge-gate';
import { DogfoodJudgeLedger } from '@/lib/agent-os/dogfood-judge-ledger';
import {
  ledgerDogfoodVerdictSource,
  readDogfoodGates,
  setDogfoodVerdictSource,
  unboundDogfoodVerdictSource,
} from './dogfood-gate.server';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/agent-os/dogfood-judge-runtime-store', () => ({
  getDogfoodJudgeLedger: () =>
    new DogfoodJudgeLedger({
      get: mocks.get,
      compareAndSet: vi.fn(),
      setIfAbsent: vi.fn(),
    }),
}));

const NOW = new Date('2026-11-12T12:00:00Z');
const PROFILE = 'profile-1';
const SURFACES = ['onboarding', `outbound-artifact:${PROFILE}`] as const;
function evidence(): DogfoodJudgeLedgerValue {
  return {
    schema: 'jovie.dogfood-judge-ledger/v1',
    currentFingerprint: 'current-rubric',
    requiredSurfaces: SURFACES,
    surfaces: Object.fromEntries(
      SURFACES.map(id => [
        id,
        {
          verdict: 'pass',
          nothingWrong: true,
          signatureVerified: true,
          sourceSha: 'deployed-sha',
          fingerprint: 'current-rubric',
          judgedAt: NOW.toISOString(),
        },
      ])
    ),
  };
}

beforeEach(() => {
  mocks.get.mockReset().mockResolvedValue(JSON.stringify(evidence()));
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'deployed-sha');
  setDogfoodVerdictSource(ledgerDogfoodVerdictSource);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setDogfoodVerdictSource(ledgerDogfoodVerdictSource);
});

describe('ledger-backed outreach gate', () => {
  it('passes both surfaces from one coherent ledger snapshot and rereads next request', async () => {
    expect(
      (await readDogfoodGates([PROFILE], NOW)).byProfile.get(PROFILE)
    ).toEqual({ passed: true, blocks: [] });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    mocks.get.mockResolvedValue(null);
    expect(
      (await readDogfoodGates([PROFILE], NOW)).byProfile.get(PROFILE)?.passed
    ).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  describe.each(SURFACES)('%s', surface => {
    it('denies a missing verdict even when the other surface passes', async () => {
      const value = evidence();
      const { [surface]: _missing, ...surfaces } = value.surfaces;
      mocks.get.mockResolvedValue(JSON.stringify({ ...value, surfaces }));
      const gates = await readDogfoodGates([PROFILE], NOW);
      expect(gates.byProfile.get(PROFILE)?.blocks).toContain(
        surface === 'onboarding'
          ? 'onboarding_not_judged'
          : 'artifact_not_judged'
      );
      expect(gates.onboarding.passed).toBe(surface !== 'onboarding');
    });

    it.each([
      ['failing verdict', { verdict: 'fail' }],
      ['unverified signature', { signatureVerified: false }],
      ['missing signoff', { nothingWrong: false }],
      ['stale fingerprint', { fingerprint: 'old-rubric' }],
      ['wrong source SHA', { sourceSha: 'old-deployment' }],
      ['missing source SHA', { sourceSha: null }],
      ['older than seven days', { judgedAt: '2026-11-04T12:00:00Z' }],
      ['invalid date', { judgedAt: 'invalid' }],
      ['future date', { judgedAt: '2026-11-13T12:00:00Z' }],
    ])('denies %s', async (_name, patch) => {
      const value = evidence();
      mocks.get.mockResolvedValue(
        JSON.stringify({
          ...value,
          surfaces: {
            ...value.surfaces,
            [surface]: { ...value.surfaces[surface], ...patch },
          },
        })
      );
      const gates = await readDogfoodGates([PROFILE], NOW);
      expect(gates.byProfile.get(PROFILE)?.passed).toBe(false);
      expect(gates.onboarding.passed).toBe(surface !== 'onboarding');
    });
  });

  it.each([null, '{invalid', '{}'])(
    'fails closed on absent or malformed ledger %s',
    async raw => {
      mocks.get.mockResolvedValue(raw);
      const gates = await readDogfoodGates([PROFILE], NOW);
      expect(gates.onboarding.passed).toBe(false);
      expect(gates.byProfile.get(PROFILE)?.passed).toBe(false);
    }
  );

  it('fails closed on unreadable evidence', async () => {
    mocks.get.mockRejectedValue(new Error('storage unavailable'));
    const gates = await readDogfoodGates([PROFILE], NOW);
    expect(gates.onboarding.passed).toBe(false);
    expect(gates.byProfile.get(PROFILE)?.passed).toBe(false);
  });

  it('does not borrow a passing verdict from another profile', async () => {
    const gates = await readDogfoodGates([PROFILE, 'profile-2'], NOW);
    expect(gates.byProfile.get(PROFILE)?.passed).toBe(true);
    expect(gates.byProfile.get('profile-2')?.blocks).toEqual([
      'artifact_not_judged',
    ]);
  });

  it('keeps the unbound seam closed', async () => {
    setDogfoodVerdictSource(unboundDogfoodVerdictSource);
    const gates = await readDogfoodGates([PROFILE], NOW);
    expect(gates.byProfile.get(PROFILE)?.passed).toBe(false);
  });
});
