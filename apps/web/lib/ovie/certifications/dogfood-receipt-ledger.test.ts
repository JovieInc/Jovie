import { describe, expect, it } from 'vitest';
import {
  dogfoodReceiptProvesOutcome,
  type DogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';
import { memoryCertificationBackend } from './fixtures';
import {
  bindDogfoodSubjectDeploy,
  dogfoodFeedStatus,
  dogfoodReceiptKey,
  DOGFOOD_RECEIPT_LEDGER_CONTRACT,
  parseDogfoodReceiptLedger,
  readDogfoodReceiptLedger,
  recordDogfoodReceipt,
} from './dogfood-receipt-ledger';
import {
  buildPublicProfileCapabilityReceipt,
  buildPublicProfileScriptedFalseSuccess,
  PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
  PUBLIC_PROFILE_FIXTURE_DEPLOY,
  seedPublicProfileDogfoodFixture,
} from './public-profile-dogfood-fixture';

const NOW = '2026-11-21T12:00:00.000Z';
const STARTED = '2026-11-21T11:58:30.000Z';

describe('dogfood receipt ledger', () => {
  it('reads null when the store is missing (disconnected, not a zero)', async () => {
    const backend = memoryCertificationBackend();
    await expect(readDogfoodReceiptLedger(backend)).resolves.toBeNull();
    expect(dogfoodFeedStatus(null).status).toBe('disconnected');
  });

  it('records a public-profile capability receipt and fixture deploy binding', async () => {
    const backend = memoryCertificationBackend();
    const { receipt, binding } = await seedPublicProfileDogfoodFixture({
      backend,
      recordedAt: NOW,
    });
    expect(binding).toEqual(PUBLIC_PROFILE_FIXTURE_DEPLOY);
    expect(receipt?.missionId).toBe(
      getCanonicalSurface('public-profile').outcomeMission.id
    );
    expect(dogfoodReceiptProvesOutcome(receipt!, {
      id: receipt!.missionId,
      outcome: getCanonicalSurface('public-profile').outcomeMission.outcome,
    })).toBe(true);

    const ledger = await readDogfoodReceiptLedger(backend);
    expect(ledger?.contract).toBe(DOGFOOD_RECEIPT_LEDGER_CONTRACT);
    expect(Object.keys(ledger!.receipts)).toHaveLength(1);
    expect(ledger!.subjectDeploys[PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID]).toEqual(
      PUBLIC_PROFILE_FIXTURE_DEPLOY
    );
    expect(ledger!.knownGoodDeploymentIds).toEqual([
      PUBLIC_PROFILE_FIXTURE_DEPLOY.deploymentId,
    ]);
    expect(dogfoodFeedStatus(ledger).status).toBe('fixture');
  });

  it('rejects a deliberate scripted false-success as outcome proof', async () => {
    const falseSuccess = buildPublicProfileScriptedFalseSuccess({
      commitSha: PUBLIC_PROFILE_FIXTURE_DEPLOY.commitSha,
      deploymentId: PUBLIC_PROFILE_FIXTURE_DEPLOY.deploymentId,
      startedAt: STARTED,
      completedAt: NOW,
    });
    expect(falseSuccess.outcome).toBe('failed');
    expect(falseSuccess.missionObservation?.method).toBe('scripted');
    expect(
      dogfoodReceiptProvesOutcome(falseSuccess, {
        id: falseSuccess.missionId,
        outcome: getCanonicalSurface('public-profile').outcomeMission.outcome,
      })
    ).toBe(false);

    const backend = memoryCertificationBackend();
    await bindDogfoodSubjectDeploy({
      backend,
      subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
      binding: PUBLIC_PROFILE_FIXTURE_DEPLOY,
      recordedAt: NOW,
    });
    await recordDogfoodReceipt({
      backend,
      receipt: falseSuccess,
      recordedAt: NOW,
    });
    const ledger = await readDogfoodReceiptLedger(backend);
    const stored = Object.values(ledger!.receipts)[0]!;
    expect(dogfoodReceiptProvesOutcome(stored)).toBe(false);
  });

  it('replays identical receipts and rejects mutations', async () => {
    const backend = memoryCertificationBackend();
    const receipt = buildPublicProfileCapabilityReceipt({
      commitSha: PUBLIC_PROFILE_FIXTURE_DEPLOY.commitSha,
      deploymentId: PUBLIC_PROFILE_FIXTURE_DEPLOY.deploymentId,
      startedAt: STARTED,
      completedAt: NOW,
    });
    await expect(
      recordDogfoodReceipt({ backend, receipt, recordedAt: NOW })
    ).resolves.toEqual({ status: 'recorded' });
    await expect(
      recordDogfoodReceipt({ backend, receipt, recordedAt: NOW })
    ).resolves.toEqual({ status: 'replayed' });

    const mutated: DogfoodReceipt = {
      ...receipt,
      actor: 'someone-else',
    };
    // Different key → new record; same key with different body is rejected.
    await expect(
      recordDogfoodReceipt({
        backend,
        receipt: {
          ...receipt,
          evidenceRefs: [...receipt.evidenceRefs, 'artifact:extra'],
        },
        recordedAt: NOW,
      })
    ).rejects.toThrow(/immutable/);
    expect(dogfoodReceiptKey(mutated)).not.toBe(dogfoodReceiptKey(receipt));
  });

  it('graduates a fixture binding to production without a new store', async () => {
    const backend = memoryCertificationBackend();
    await seedPublicProfileDogfoodFixture({ backend, recordedAt: NOW });
    const production = {
      commitSha: 'b'.repeat(40),
      deploymentId: 'dpl_prod_public_profile',
      source: 'production' as const,
    };
    await bindDogfoodSubjectDeploy({
      backend,
      subjectId: PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID,
      binding: production,
      recordedAt: NOW,
    });
    const ledger = await readDogfoodReceiptLedger(backend);
    expect(ledger!.subjectDeploys[PUBLIC_PROFILE_DOGFOOD_SUBJECT_ID]).toEqual(
      production
    );
    expect(dogfoodFeedStatus(ledger).status).toBe('production');
    expect(ledger!.knownGoodDeploymentIds).toEqual(
      [
        PUBLIC_PROFILE_FIXTURE_DEPLOY.deploymentId,
        production.deploymentId,
      ].sort()
    );
  });

  it('fails closed on malformed ledger JSON', () => {
    expect(() => parseDogfoodReceiptLedger('{')).toThrow(/not valid JSON/);
    expect(() => parseDogfoodReceiptLedger({ schemaVersion: 99 })).toThrow(
      /unexpected shape/
    );
  });
});
