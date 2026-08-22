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
const EXPIRED = '2026-08-22T03:00:00.000Z';
const FINGERPRINT = 'ci-fast:typecheck:missing-export';
const directories = [];
function lease(overrides = {}) {
  return buildImplementerLease({
    repository: 'JovieInc/Jovie',
    prNumber: 16337,
    headSha: HEAD_A,
    failureFingerprint: FINGERPRINT,
    implementerId: 'codex/jov-5273',
    issuedAt: '2026-08-22T00:00:00.000Z',
    expiresAt: '2026-08-22T02:00:00.000Z',
    ...overrides,
  });
}
function transfer(currentLease, overrides = {}, now = NOW) {
  return buildOwnershipTransferReceipt(
    {
      lease: currentLease,
      kind: 'handoff',
      recordedBy: currentLease.owner.id,
      reason: 'implementation context transferred',
      evidenceSource: 'pr-handoff-receipt:16337',
      ...overrides,
    },
    { now }
  );
}
function evidence(overrides = {}) {
  return {
    repository: 'JovieInc/Jovie',
    prNumber: 16337,
    headSha: HEAD_A,
    failureFingerprint: FINGERPRINT,
    ...overrides,
  };
}
async function stateDir() {
  const directory = await mkdtemp(join(tmpdir(), 'jovie-handoff-'));
  directories.push(directory);
  return directory;
}
function ownershipDir(directory, claimKey = lease().claimKey) {
  return join(directory, 'rolling-ci-ownership', claimKey);
}
function acquire(directory, currentLease = lease(), overrides = {}) {
  return acquireRemediationWriterClaim(
    {
      lease: currentLease,
      currentHeadSha: currentLease.headSha,
      ...overrides,
    },
    { stateDir: directory, now: overrides.now ?? NOW }
  );
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
    for (const [overrides, message] of [
      [{ repository: 'Jovie' }, /owner\/name/],
      [{ prNumber: 0 }, /positive integer/],
      [{ headSha: 'not-a-sha' }, /40-character SHA/],
      [{ failureFingerprint: '' }, /is required/],
      [{ issuedAt: 'not-a-date' }, /ISO timestamp/],
      [{ expiresAt: '2026-08-21T23:00:00.000Z' }, /later than issuedAt/],
    ]) {
      expect(() => lease(overrides)).toThrow(message);
    }
    expect(() => routeRemediationOwner({ lease: {} })).toThrow(/malformed/);
    const active = lease();
    expect(() => transfer(active, { kind: 'delegated' })).toThrow(
      /handoff or abandonment/
    );
    expect(() => transfer(active, { recordedBy: 'competing-agent' })).toThrow(
      /active implementer/
    );
    active.claimKey = '../escape';
    expect(() => routeRemediationOwner({ lease: active })).toThrow(/integrity/);
  });
  it('routes the live implementer and refuses implicit FX after expiry', () => {
    expect(
      routeRemediationOwner(
        { lease: lease(), fxAdapter: { id: 'fx', authConfigured: false } },
        { now: NOW }
      )
    ).toMatchObject({
      status: 'routed',
      route: 'implementer',
      writer: { kind: 'implementer', id: 'codex/jov-5273' },
    });
    expect(
      routeRemediationOwner(
        { lease: lease(), fxAdapter: { id: 'fx', authConfigured: true } },
        { now: EXPIRED }
      )
    ).toEqual({ status: 'rejected', reason: 'explicit-handoff-required' });
  });
  it('routes FX only through an exact explicit handoff', () => {
    const currentLease = lease();
    const handoff = transfer(currentLease);
    expect(
      routeRemediationOwner(
        {
          lease: currentLease,
          transferReceipt: handoff,
          fxAdapter: { id: 'fx-v0.0.4', authConfigured: true },
        },
        { now: NOW }
      )
    ).toMatchObject({
      status: 'routed',
      route: 'fx-backstop',
      writer: { kind: 'fx', id: 'fx-v0.0.4' },
    });
    for (const invalidReceipt of [
      { ...handoff, observedAt: null },
      { ...handoff, claimKey: 'wrong-claim' },
      { ...handoff, reason: 'tampered after receipt creation' },
    ]) {
      expect(
        routeRemediationOwner({
          lease: currentLease,
          transferReceipt: invalidReceipt,
        })
      ).toEqual({ status: 'rejected', reason: 'handoff-receipt-mismatch' });
    }
    const futureHandoff = transfer(
      currentLease,
      {},
      '2026-08-22T01:30:00.000Z'
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
  });
  it('makes missing FX auth a terminal incident without blocking implementers', () => {
    const currentLease = lease();
    const handoff = transfer(currentLease);
    const result = routeRemediationOwner(
      {
        lease: currentLease,
        transferReceipt: handoff,
        fxAdapter: { id: 'fx-v0.0.4', authConfigured: false },
      },
      { now: NOW }
    );
    expect(result.incident).toMatchObject({
      schema: FX_CONFIGURATION_INCIDENT_SCHEMA,
      status: 'terminal',
      missing: ['fx-auth'],
      implementerOwnedRepairBlocked: false,
    });
    expect(
      routeRemediationOwner(
        { lease: currentLease, transferReceipt: handoff, fxAdapter: null },
        { now: NOW }
      ).status
    ).toBe('configuration-incident');
  });
  it('allows controller abandonment only after lease expiry', () => {
    const currentLease = lease();
    const abandoned = (now = NOW) =>
      transfer(
        currentLease,
        {
          kind: 'abandonment',
          recordedBy: 'rolling-ci-controller',
          reason: 'lease heartbeat disappeared',
          evidenceSource: 'lease-monitor:42',
        },
        now
      );
    expect(abandoned).toThrow(/expired lease/);
    expect(
      routeRemediationOwner(
        {
          lease: currentLease,
          transferReceipt: abandoned(EXPIRED),
          fxAdapter: { id: 'fx-v0.0.4', authConfigured: true },
        },
        { now: EXPIRED }
      ).route
    ).toBe('fx-backstop');
  });
  it('deliberate red: admits exactly one writer under competing claims', async () => {
    const directory = await stateDir();
    const candidates = [lease(), lease({ implementerId: 'competing-agent' })];
    const results = await Promise.all(
      candidates.map(candidate => acquire(directory, candidate))
    );
    expect(results.map(result => result.status).sort()).toEqual([
      'acquired',
      'conflict',
    ]);
    const winner = results.find(result => result.status === 'acquired');
    const winningLease = candidates.find(
      candidate => candidate.owner.id === winner.claim.writer.id
    );
    expect((await acquire(directory, winningLease)).status).toBe('duplicate');
  });
  it('supersedes a prior head and rejects its delayed delivery', async () => {
    const directory = await stateDir();
    const first = await acquire(directory);
    const newer = lease({
      headSha: HEAD_B,
      issuedAt: '2026-08-22T01:05:00.000Z',
      expiresAt: '2026-08-22T03:05:00.000Z',
    });
    const next = await acquire(directory, newer, {
      now: '2026-08-22T01:05:00.000Z',
    });
    expect(next).toMatchObject({
      status: 'superseded-and-acquired',
      superseded: {
        writerClaimKey: first.claim.writerClaimKey,
        status: 'superseded',
        supersededReason: 'new-head',
      },
    });
    expect(
      authorizeRemediationMutation({
        claim: first.claim,
        writerId: first.claim.writer.id,
        currentHeadSha: HEAD_B,
      })
    ).toEqual({ authorized: false, reason: 'superseded-head' });
    expect(
      await acquire(directory, lease(), { now: '2026-08-22T01:06:00.000Z' })
    ).toEqual({ status: 'rejected', reason: 'out-of-order-head' });
  });
  it('persists green rerun supersession and rejects invalid green evidence', async () => {
    const emptyDirectory = await stateDir();
    expect(
      await supersedeRemediationWriterClaim(
        { ...evidence(), checkConclusion: 'failure' },
        { stateDir: emptyDirectory, now: NOW }
      )
    ).toEqual({ status: 'rejected', reason: 'green-proof-required' });
    expect(
      await supersedeRemediationWriterClaim(
        { ...evidence(), checkConclusion: 'success' },
        { stateDir: emptyDirectory, now: NOW }
      )
    ).toEqual({ status: 'ignored', reason: 'no-active-claim' });
    const directory = await stateDir();
    const active = await acquire(directory);
    expect(
      await supersedeRemediationWriterClaim(
        { ...evidence({ headSha: HEAD_B }), checkConclusion: 'success' },
        { stateDir: directory, now: NOW }
      )
    ).toEqual({ status: 'rejected', reason: 'stale-head' });
    const superseded = await supersedeRemediationWriterClaim(
      { ...evidence(), checkConclusion: 'success' },
      { stateDir: directory, now: '2026-08-22T01:10:00.000Z' }
    );
    expect(superseded).toMatchObject({
      status: 'superseded',
      claim: { status: 'superseded', supersededReason: 'green-rerun' },
    });
    expect(
      authorizeRemediationMutation({
        claim: superseded.claim,
        writerId: active.claim.writer.id,
        currentHeadSha: HEAD_A,
      })
    ).toEqual({ authorized: false, reason: 'claim-not-active' });
  });
  it('rejects stale or unroutable acquisition before persistence', async () => {
    const directory = await stateDir();
    expect(
      await acquire(directory, lease(), { currentHeadSha: HEAD_B })
    ).toEqual({ status: 'rejected', reason: 'stale-head' });
    expect(await acquire(directory, lease(), { now: EXPIRED })).toEqual({
      status: 'rejected',
      reason: 'explicit-handoff-required',
    });
  });
  it('fails closed on corrupt state and a non-progressing lock', async () => {
    const currentLease = lease();
    for (const [filename, contents, matcher] of [
      ['current.json', '{broken', SyntaxError],
      ['.writer-lock', 'busy', { code: 'EEXIST' }],
    ]) {
      const directory = await stateDir();
      const claimDirectory = ownershipDir(directory, currentLease.claimKey);
      await mkdir(claimDirectory, { recursive: true });
      await writeFile(join(claimDirectory, filename), contents);
      const assertion = expect(acquire(directory, currentLease)).rejects;
      if (matcher === SyntaxError) await assertion.toBeInstanceOf(matcher);
      else await assertion.toMatchObject(matcher);
    }
  });
  it('authorizes only the exact active writer while its check is red', async () => {
    const directory = await stateDir();
    const result = await acquire(directory);
    const authorize = overrides =>
      authorizeRemediationMutation({
        claim: result.claim,
        writerId: result.claim.writer.id,
        currentHeadSha: HEAD_A,
        ...overrides,
      });
    expect(authorize({ writerId: 'competing-agent' })).toEqual({
      authorized: false,
      reason: 'writer-mismatch',
    });
    expect(authorize({ checkConclusion: 'success' })).toEqual({
      authorized: false,
      reason: 'green-rerun',
    });
    const forged = { ...result.claim, route: 'forged' };
    expect(authorize({ claim: forged })).toEqual({
      authorized: false,
      reason: 'claim-integrity-failed',
    });
    const currentPath = join(
      ownershipDir(directory, result.claim.claimKey),
      'current.json'
    );
    await writeFile(currentPath, JSON.stringify(forged));
    await expect(acquire(directory)).rejects.toThrow(/integrity/);
    expect(authorize()).toEqual({
      authorized: true,
      reason: 'exact-head-writer',
    });
  });
});
