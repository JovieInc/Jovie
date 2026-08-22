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

  it('deduplicates one writer and rejects a competing writer for the same root cause', async () => {
    const directory = await stateDir();
    const currentLease = lease();
    const first = await acquireRemediationWriterClaim(
      { lease: currentLease, currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    expect(first.status).toBe('acquired');

    const duplicate = await acquireRemediationWriterClaim(
      { lease: currentLease, currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    expect(duplicate.status).toBe('duplicate');

    const competingLease = lease({ implementerId: 'competing-agent' });
    const conflict = await acquireRemediationWriterClaim(
      { lease: competingLease, currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    expect(conflict).toMatchObject({
      status: 'conflict',
      reason: 'writer-already-claimed',
    });
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
    expect(next.superseded.writerClaimKey).toBe(first.claim.writerClaimKey);
    expect(
      authorizeRemediationMutation({
        claim: first.claim,
        writerId: first.claim.writer.id,
        currentHeadSha: HEAD_B,
      })
    ).toEqual({ authorized: false, reason: 'superseded-head' });
  });

  it('makes a green rerun cancel authorization for the exact head', async () => {
    const directory = await stateDir();
    const result = await acquireRemediationWriterClaim(
      { lease: lease(), currentHeadSha: HEAD_A },
      { stateDir: directory, now: NOW }
    );
    expect(
      authorizeRemediationMutation({
        claim: result.claim,
        writerId: result.claim.writer.id,
        currentHeadSha: HEAD_A,
        checkConclusion: 'success',
      })
    ).toEqual({ authorized: false, reason: 'green-rerun' });
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
