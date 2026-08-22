import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireRemediationWriterClaim,
  authorizeRemediationMutation,
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
