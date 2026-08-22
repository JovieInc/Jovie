import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireRemediationWriterClaim,
  authorizeRemediationMutation,
  buildFxConfigurationIncident,
  buildImplementerLease,
  buildOwnershipTransferReceipt,
  FX_CONFIGURATION_INCIDENT_SCHEMA,
  routeRemediationOwner,
  supersedeRemediationWriterClaim,
} from '../rolling-ci-handoff.mjs';

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);
const NOW = '2026-08-22T01:00:00.000Z';
const directories = [];

function lease(overrides = {}) {
  return buildImplementerLease({
    repository: 'JovieInc/Jovie',
    prNumber: 16337,
    headSha: HEAD_A,
    failureFingerprint: 'ci-fast:typecheck:missing-export',
    implementerId: 'codex/jov-5273',
    issuedAt: '2026-08-22T00:00:00.000Z',
    expiresAt: '2026-08-22T02:00:00.000Z',
    ...overrides,
  });
}

async function stateDir() {
  const directory = await mkdtemp(join(tmpdir(), 'jovie-handoff-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

describe('rolling CI remediation ownership', () => {
  it('fails closed on malformed identity, lease, and transfer evidence', () => {
    expect(() => lease({ repository: 'Jovie' })).toThrow(/owner\/name/);
    expect(() => lease({ prNumber: 0 })).toThrow(/positive integer/);
    expect(() => lease({ headSha: 'not-a-sha' })).toThrow(/40-character SHA/);
    expect(() => lease({ failureFingerprint: '' })).toThrow(/is required/);
    expect(() => lease({ issuedAt: 'not-a-date' })).toThrow(/ISO timestamp/);
    expect(() => lease({ expiresAt: '2026-08-21T23:00:00.000Z' })).toThrow(
      /later than issuedAt/
    );
    expect(() => routeRemediationOwner({ lease: {} })).toThrow(/malformed/);

    const currentLease = lease();
    expect(() =>
      buildOwnershipTransferReceipt({
        lease: currentLease,
        kind: 'delegated',
        recordedBy: currentLease.owner.id,
        reason: 'invalid transfer',
        evidenceSource: 'test',
      })
    ).toThrow(/handoff or abandonment/);
    expect(() =>
      buildOwnershipTransferReceipt({
        lease: currentLease,
        kind: 'handoff',
        recordedBy: 'competing-agent',
        reason: 'not the owner',
        evidenceSource: 'test',
      })
    ).toThrow(/active implementer/);
  });

  it('routes a live lease to the implementer even when FX auth is missing', () => {
    const result = routeRemediationOwner(
      { lease: lease(), fxAdapter: { id: 'fx', authConfigured: false } },
      { now: NOW }
    );
    expect(result).toMatchObject({
      status: 'routed',
      route: 'implementer',
      writer: { kind: 'implementer', id: 'codex/jov-5273' },
    });
  });

  it('deliberate red: refuses FX after expiry without explicit abandonment', () => {
    const result = routeRemediationOwner(
      { lease: lease(), fxAdapter: { id: 'fx', authConfigured: true } },
      { now: '2026-08-22T03:00:00.000Z' }
    );
    expect(result).toEqual({
      status: 'rejected',
      reason: 'explicit-handoff-required',
    });
  });

  it('routes FX only after the implementer records an exact handoff', () => {
    const currentLease = lease();
    const handoff = buildOwnershipTransferReceipt({
      lease: currentLease,
      kind: 'handoff',
      recordedBy: currentLease.owner.id,
      reason: 'implementation context transferred',
      evidenceSource: 'pr-handoff-receipt:16337',
    });
    expect(
      routeRemediationOwner({
        lease: currentLease,
        transferReceipt: handoff,
        fxAdapter: { id: 'fx-v0.0.4', authConfigured: true },
      })
    ).toMatchObject({
      status: 'routed',
      route: 'fx-backstop',
      writer: { kind: 'fx', id: 'fx-v0.0.4' },
    });
  });

  it('surfaces missing FX auth as a terminal configuration incident after handoff', () => {
    const currentLease = lease();
    const handoff = buildOwnershipTransferReceipt({
      lease: currentLease,
      kind: 'handoff',
      recordedBy: currentLease.owner.id,
      reason: 'implementation complete',
      evidenceSource: 'pr-handoff-receipt:16337',
    });
    const result = routeRemediationOwner({
      lease: currentLease,
      transferReceipt: handoff,
      fxAdapter: { id: 'fx-v0.0.4', authConfigured: false },
    });
    expect(result.status).toBe('configuration-incident');
    expect(result.incident).toMatchObject({
      schema: FX_CONFIGURATION_INCIDENT_SCHEMA,
      status: 'terminal',
      missing: ['fx-auth'],
      implementerOwnedRepairBlocked: false,
    });
    expect(
      routeRemediationOwner({
        lease: currentLease,
        transferReceipt: handoff,
        fxAdapter: null,
      }).status
    ).toBe('configuration-incident');
  });

  it('rejects mismatched or future transfer evidence', () => {
    const currentLease = lease();
    const futureHandoff = buildOwnershipTransferReceipt(
      {
        lease: currentLease,
        kind: 'handoff',
        recordedBy: currentLease.owner.id,
        reason: 'future receipt',
        evidenceSource: 'test:future',
      },
      { now: '2026-08-22T01:30:00.000Z' }
    );
    expect(
      routeRemediationOwner(
        { lease: currentLease, transferReceipt: futureHandoff },
        { now: NOW }
      )
    ).toEqual({ status: 'rejected', reason: 'handoff-receipt-mismatch' });
    expect(() =>
      buildFxConfigurationIncident(currentLease, futureHandoff, { now: NOW })
    ).toThrow(/exact handoff receipt/);
    expect(
      routeRemediationOwner({
        lease: currentLease,
        transferReceipt: { ...futureHandoff, observedAt: null },
      })
    ).toEqual({ status: 'rejected', reason: 'handoff-receipt-mismatch' });
    expect(
      routeRemediationOwner({
        lease: currentLease,
        transferReceipt: { ...futureHandoff, claimKey: 'wrong-claim' },
      })
    ).toEqual({ status: 'rejected', reason: 'handoff-receipt-mismatch' });
  });

  it('allows controller-recorded abandonment only after lease expiry', () => {
    const currentLease = lease();
    expect(() =>
      buildOwnershipTransferReceipt(
        {
          lease: currentLease,
          kind: 'abandonment',
          recordedBy: 'rolling-ci-controller',
          reason: 'lease heartbeat disappeared',
          evidenceSource: 'lease-monitor:42',
        },
        { now: NOW }
      )
    ).toThrow(/expired lease/);
    const abandoned = buildOwnershipTransferReceipt(
      {
        lease: currentLease,
        kind: 'abandonment',
        recordedBy: 'rolling-ci-controller',
        reason: 'lease heartbeat disappeared',
        evidenceSource: 'lease-monitor:42',
      },
      { now: '2026-08-22T03:00:00.000Z' }
    );
    expect(
      routeRemediationOwner(
        {
          lease: currentLease,
          transferReceipt: abandoned,
          fxAdapter: { id: 'fx-v0.0.4', authConfigured: true },
        },
        { now: '2026-08-22T03:00:00.000Z' }
      ).route
    ).toBe('fx-backstop');
  });

  it('deliberate red: admits exactly one writer under competing claims', async () => {
    const directory = await stateDir();
    const firstLease = lease();
    const competingLease = lease({ implementerId: 'competing-agent' });
    const results = await Promise.all([
      acquireRemediationWriterClaim(
        { lease: firstLease, currentHeadSha: HEAD_A },
        { stateDir: directory, now: NOW }
      ),
      acquireRemediationWriterClaim(
        { lease: competingLease, currentHeadSha: HEAD_A },
        { stateDir: directory, now: NOW }
      ),
    ]);
    expect(results.map(result => result.status).sort()).toEqual([
      'acquired',
      'conflict',
    ]);
    const winner = results.find(result => result.status === 'acquired');

    const duplicate = await acquireRemediationWriterClaim(
      {
        lease:
          winner.claim.writer.id === firstLease.owner.id
            ? firstLease
            : competingLease,
        currentHeadSha: HEAD_A,
      },
      { stateDir: directory, now: NOW }
    );
    expect(duplicate.status).toBe('duplicate');
  });

  it('supersedes the old claim on a newly verified current head', async () => {
    const directory = await stateDir();
    const first = await acquireRemediationWriterClaim(
      { lease: lease(), currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    const nextLease = lease({
      headSha: HEAD_B,
      issuedAt: '2026-08-22T01:05:00.000Z',
      expiresAt: '2026-08-22T03:05:00.000Z',
    });
    const next = await acquireRemediationWriterClaim(
      { lease: nextLease, currentHeadSha: HEAD_B },
      { stateDir: directory, now: '2026-08-22T01:05:00.000Z' }
    );
    expect(next.status).toBe('superseded-and-acquired');
    expect(next.superseded).toMatchObject({
      writerClaimKey: first.claim.writerClaimKey,
      status: 'superseded',
      supersededReason: 'new-head',
    });
    expect(
      authorizeRemediationMutation({
        claim: first.claim,
        writerId: first.claim.writer.id,
        currentHeadSha: HEAD_B,
      })
    ).toEqual({ authorized: false, reason: 'superseded-head' });
  });

  it('persists a green rerun as a superseded exact-head claim', async () => {
    const directory = await stateDir();
    const result = await acquireRemediationWriterClaim(
      { lease: lease(), currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    const superseded = await supersedeRemediationWriterClaim(
      {
        repository: 'JovieInc/Jovie',
        prNumber: 16337,
        headSha: HEAD_A,
        failureFingerprint: 'ci-fast:typecheck:missing-export',
        checkConclusion: 'success',
      },
      { stateDir: directory, now: '2026-08-22T01:10:00.000Z' }
    );
    expect(superseded).toMatchObject({
      status: 'superseded',
      claim: { status: 'superseded', supersededReason: 'green-rerun' },
    });
    expect(
      authorizeRemediationMutation({
        claim: superseded.claim,
        writerId: result.claim.writer.id,
        currentHeadSha: HEAD_A,
      })
    ).toEqual({ authorized: false, reason: 'claim-not-active' });
  });

  it('rejects an older head event delivered after a newer claim', async () => {
    const directory = await stateDir();
    const newer = lease({
      headSha: HEAD_B,
      issuedAt: '2026-08-22T01:05:00.000Z',
      expiresAt: '2026-08-22T03:05:00.000Z',
    });
    await acquireRemediationWriterClaim(
      { lease: newer, currentHeadSha: HEAD_B },
      { stateDir: directory, now: '2026-08-22T01:05:00.000Z' }
    );
    await expect(
      acquireRemediationWriterClaim(
        { lease: lease(), currentHeadSha: HEAD_A },
        { stateDir: directory, now: '2026-08-22T01:06:00.000Z' }
      )
    ).resolves.toEqual({ status: 'rejected', reason: 'out-of-order-head' });
  });

  it('requires a routed owner before durable acquisition', async () => {
    const directory = await stateDir();
    await expect(
      acquireRemediationWriterClaim(
        { lease: lease(), currentHeadSha: HEAD_A },
        { stateDir: directory, now: '2026-08-22T03:00:00.000Z' }
      )
    ).resolves.toEqual({
      status: 'rejected',
      reason: 'explicit-handoff-required',
    });
  });

  it('fails closed on corrupt claim state and a non-progressing lock', async () => {
    const corruptDirectory = await stateDir();
    const currentLease = lease();
    const corruptClaimDirectory = join(
      corruptDirectory,
      'rolling-ci-ownership',
      currentLease.claimKey
    );
    await mkdir(corruptClaimDirectory, { recursive: true });
    await writeFile(join(corruptClaimDirectory, 'current.json'), '{broken');
    await expect(
      acquireRemediationWriterClaim(
        { lease: currentLease, currentHeadSha: HEAD_A },
        { stateDir: corruptDirectory, now: NOW }
      )
    ).rejects.toBeInstanceOf(SyntaxError);

    const lockedDirectory = await stateDir();
    const lockedClaimDirectory = join(
      lockedDirectory,
      'rolling-ci-ownership',
      currentLease.claimKey
    );
    await mkdir(lockedClaimDirectory, { recursive: true });
    await writeFile(join(lockedClaimDirectory, '.writer-lock'), 'busy');
    await expect(
      acquireRemediationWriterClaim(
        { lease: currentLease, currentHeadSha: HEAD_A },
        { stateDir: lockedDirectory, now: NOW }
      )
    ).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('ignores absent green claims and rejects stale or non-green supersession', async () => {
    const directory = await stateDir();
    const evidence = {
      repository: 'JovieInc/Jovie',
      prNumber: 16337,
      headSha: HEAD_A,
      failureFingerprint: 'ci-fast:typecheck:missing-export',
    };
    await expect(
      supersedeRemediationWriterClaim(
        { ...evidence, checkConclusion: 'failure' },
        { stateDir: directory, now: NOW }
      )
    ).resolves.toEqual({
      status: 'rejected',
      reason: 'green-proof-required',
    });
    await expect(
      supersedeRemediationWriterClaim(
        { ...evidence, checkConclusion: 'success' },
        { stateDir: directory, now: NOW }
      )
    ).resolves.toEqual({ status: 'ignored', reason: 'no-active-claim' });
    await acquireRemediationWriterClaim(
      { lease: lease(), currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    await expect(
      supersedeRemediationWriterClaim(
        { ...evidence, headSha: HEAD_B, checkConclusion: 'success' },
        { stateDir: directory, now: NOW }
      )
    ).resolves.toEqual({ status: 'rejected', reason: 'stale-head' });
  });

  it('authorizes only the exact active writer while the check remains red', async () => {
    const directory = await stateDir();
    const result = await acquireRemediationWriterClaim(
      { lease: lease(), currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    expect(
      authorizeRemediationMutation({
        claim: result.claim,
        writerId: 'competing-agent',
        currentHeadSha: HEAD_A,
      })
    ).toEqual({ authorized: false, reason: 'writer-mismatch' });
    expect(
      authorizeRemediationMutation({
        claim: result.claim,
        writerId: result.claim.writer.id,
        currentHeadSha: HEAD_A,
        checkConclusion: 'success',
      })
    ).toEqual({ authorized: false, reason: 'green-rerun' });
    expect(
      authorizeRemediationMutation({
        claim: result.claim,
        writerId: result.claim.writer.id,
        currentHeadSha: HEAD_A,
      })
    ).toEqual({ authorized: true, reason: 'exact-head-writer' });
  });

  it('rejects stale-head acquisition before any writer claim is persisted', async () => {
    const directory = await stateDir();
    await expect(
      acquireRemediationWriterClaim(
        { lease: lease(), currentHeadSha: HEAD_B },
        { stateDir: directory, now: NOW }
      )
    ).resolves.toEqual({ status: 'rejected', reason: 'stale-head' });
  });
});
