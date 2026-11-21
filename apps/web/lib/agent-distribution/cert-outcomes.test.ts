import { describe, expect, it } from 'vitest';
import {
  CLAIM_OUTCOME_ENV,
  exerciseClaimOutcomes,
  missingClaimOutcomeEnv,
} from './cert-outcomes';

describe('claim outcome env gate', () => {
  it('lists every missing claim-walk secret', () => {
    expect(missingClaimOutcomeEnv({})).toEqual([...CLAIM_OUTCOME_ENV]);
    expect(
      missingClaimOutcomeEnv({
        CRON_SECRET: 'x',
        SYNTHETIC_PASSAGE_KEY: 'y',
        DATABASE_URL: 'postgres://x',
      })
    ).toEqual([]);
  });

  it('SKIPs both required outcomes when secrets are absent', async () => {
    const checks = await exerciseClaimOutcomes({
      origin: 'https://jov.ie',
      run: 'cert-test',
      draftId: 'd1',
      claimUrl: 'https://jov.ie/claim/agent/d1?h=x',
      env: {},
    });
    expect(checks.map(c => c.status)).toEqual(['SKIP', 'SKIP']);
    expect(checks[0]?.detail).toMatchObject({
      gate: 'claim-walk-secrets',
      missing: [...CLAIM_OUTCOME_ENV],
    });
  });

  it('SKIPs claim-walker-unwired when secrets are present but walk is omitted', async () => {
    const checks = await exerciseClaimOutcomes({
      origin: 'https://jov.ie',
      run: 'cert-test',
      draftId: 'd1',
      claimUrl: 'https://jov.ie/claim/agent/d1?h=x',
      env: {
        CRON_SECRET: 'x',
        SYNTHETIC_PASSAGE_KEY: 'y',
        DATABASE_URL: 'postgres://x',
      },
    });
    expect(checks.map(c => c.status)).toEqual(['SKIP', 'SKIP']);
    expect(checks[0]?.detail).toMatchObject({ gate: 'claim-walker-unwired' });
  });

  it('records walker results when secrets and walker are present', async () => {
    const checks = await exerciseClaimOutcomes({
      origin: 'https://jov.ie',
      run: 'cert-test',
      draftId: 'd1',
      claimUrl: 'https://jov.ie/claim/agent/d1?h=x',
      env: {
        CRON_SECRET: 'x',
        SYNTHETIC_PASSAGE_KEY: 'y',
        DATABASE_URL: 'postgres://x',
      },
      walk: async () => ({
        claimPersisted: true,
        fixturesCleaned: false,
        detail: { profile: 'jovie-prodcert-claim' },
      }),
    });
    expect(checks.map(c => [c.check, c.status])).toEqual([
      ['claim outcome persisted', 'PASS'],
      ['run-owned fixtures cleaned up', 'FAIL'],
    ]);
  });
});
