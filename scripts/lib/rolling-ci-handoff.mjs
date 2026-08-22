#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DEFAULT_DELIVERY_STATE_DIR } from '../backlog-orchestrator/delivery-state-machine.mjs';
export const OWNERSHIP_LEASE_SCHEMA = 'jovie-rolling-ci-owner-lease/v1';
export const OWNERSHIP_TRANSFER_SCHEMA = 'jovie-rolling-ci-handoff/v1';
export const WRITER_CLAIM_SCHEMA = 'jovie-rolling-ci-writer-claim/v1';
export const FX_CONFIGURATION_INCIDENT_SCHEMA =
  'jovie-rolling-ci-fx-configuration-incident/v1';

const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = /^[^/\s]+\/[^/\s]+$/;
function nonEmpty(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}
function exactSha(value, field = 'headSha') {
  const sha = nonEmpty(value, field).toLowerCase();
  if (!SHA.test(sha)) throw new Error(`${field} must be a 40-character SHA`);
  return sha;
}
function instant(value, field) {
  const normalized = nonEmpty(value, field);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return new Date(normalized).toISOString();
}
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function ownershipIdentity(input) {
  const repository = nonEmpty(input.repository, 'repository');
  if (!REPOSITORY.test(repository)) {
    throw new Error('repository must be owner/name');
  }
  if (!Number.isInteger(input.prNumber) || input.prNumber <= 0) {
    throw new Error('prNumber must be a positive integer');
  }
  return {
    repository,
    prNumber: input.prNumber,
    headSha: exactSha(input.headSha),
    failureFingerprint: nonEmpty(
      input.failureFingerprint,
      'failureFingerprint'
    ),
  };
}
export function buildImplementerLease(input) {
  const identity = ownershipIdentity(input);
  const issuedAt = instant(input.issuedAt, 'issuedAt');
  const expiresAt = instant(input.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new Error('expiresAt must be later than issuedAt');
  }
  const ownerId = nonEmpty(input.implementerId, 'implementerId');
  const claimKey = digest({
    repository: identity.repository,
    prNumber: identity.prNumber,
    failureFingerprint: identity.failureFingerprint,
  });
  return {
    schema: OWNERSHIP_LEASE_SCHEMA,
    leaseKey: digest({
      claimKey,
      headSha: identity.headSha,
      ownerId,
      issuedAt,
    }),
    claimKey,
    ...identity,
    owner: { kind: 'implementer', id: ownerId },
    issuedAt,
    expiresAt,
  };
}
function assertLease(lease) {
  if (lease?.schema !== OWNERSHIP_LEASE_SCHEMA) {
    throw new Error('implementer lease is missing or malformed');
  }
  ownershipIdentity(lease);
  exactSha(lease.headSha);
  instant(lease.issuedAt, 'issuedAt');
  instant(lease.expiresAt, 'expiresAt');
  nonEmpty(lease.owner?.id, 'lease owner');
  return lease;
}
export function buildOwnershipTransferReceipt(
  input,
  { now = new Date().toISOString() } = {}
) {
  const lease = assertLease(input.lease);
  const kind = input.kind;
  if (!['handoff', 'abandonment'].includes(kind)) {
    throw new Error('transfer kind must be handoff or abandonment');
  }
  const observedAt = instant(now, 'observedAt');
  const recordedBy = nonEmpty(input.recordedBy, 'recordedBy');
  const reason = nonEmpty(input.reason, 'reason');
  const evidenceSource = nonEmpty(input.evidenceSource, 'evidenceSource');
  const ownerRecorded = recordedBy === lease.owner.id;
  if (kind === 'handoff' && !ownerRecorded) {
    throw new Error('handoff must be recorded by the active implementer');
  }
  if (
    kind === 'abandonment' &&
    !ownerRecorded &&
    Date.parse(observedAt) < Date.parse(lease.expiresAt)
  ) {
    throw new Error('controller abandonment requires an expired lease');
  }
  const receipt = {
    schema: OWNERSHIP_TRANSFER_SCHEMA,
    kind,
    leaseKey: lease.leaseKey,
    claimKey: lease.claimKey,
    repository: lease.repository,
    prNumber: lease.prNumber,
    headSha: lease.headSha,
    failureFingerprint: lease.failureFingerprint,
    from: lease.owner,
    to: { kind: 'fx', id: 'fx-backstop' },
    recordedBy,
    reason,
    evidenceSource,
    observedAt,
  };
  return { ...receipt, receiptKey: digest(receipt) };
}
function validTransfer(lease, receipt) {
  return (
    receipt?.schema === OWNERSHIP_TRANSFER_SCHEMA &&
    receipt.leaseKey === lease.leaseKey &&
    receipt.claimKey === lease.claimKey &&
    receipt.repository === lease.repository &&
    receipt.prNumber === lease.prNumber &&
    receipt.headSha === lease.headSha &&
    receipt.failureFingerprint === lease.failureFingerprint &&
    receipt.from?.id === lease.owner.id &&
    receipt.to?.kind === 'fx'
  );
}
function validTransferAt(lease, receipt, observedAt) {
  if (!validTransfer(lease, receipt)) return false;
  const transferAt = Date.parse(String(receipt.observedAt ?? ''));
  return (
    Number.isFinite(transferAt) &&
    transferAt >= Date.parse(lease.issuedAt) &&
    transferAt <= Date.parse(observedAt)
  );
}
export function buildFxConfigurationIncident(
  lease,
  transferReceipt,
  { now = new Date().toISOString() } = {}
) {
  assertLease(lease);
  const observedAt = instant(now, 'observedAt');
  if (!validTransferAt(lease, transferReceipt, observedAt)) {
    throw new Error(
      'FX configuration incident requires an exact handoff receipt'
    );
  }
  const incident = {
    schema: FX_CONFIGURATION_INCIDENT_SCHEMA,
    type: 'configuration_incident',
    status: 'terminal',
    repository: lease.repository,
    prNumber: lease.prNumber,
    headSha: lease.headSha,
    failureFingerprint: lease.failureFingerprint,
    claimKey: lease.claimKey,
    missing: ['fx-auth'],
    owner: 'ci-configuration',
    remedy:
      'Configure the FX adapter authentication through the authorized secret-management path, then redeliver the exact current-head claim.',
    implementerOwnedRepairBlocked: false,
    observedAt,
  };
  return { ...incident, incidentKey: digest(incident) };
}
export function routeRemediationOwner(
  { lease, transferReceipt = null, fxAdapter = null },
  { now = new Date().toISOString() } = {}
) {
  assertLease(lease);
  const observedAt = instant(now, 'observedAt');
  if (transferReceipt && !validTransferAt(lease, transferReceipt, observedAt)) {
    return { status: 'rejected', reason: 'handoff-receipt-mismatch' };
  }
  if (
    !transferReceipt &&
    Date.parse(observedAt) < Date.parse(lease.expiresAt)
  ) {
    return { status: 'routed', writer: lease.owner, route: 'implementer' };
  }
  if (!transferReceipt) {
    return { status: 'rejected', reason: 'explicit-handoff-required' };
  }
  const adapterId =
    typeof fxAdapter?.id === 'string' && fxAdapter.id.trim()
      ? fxAdapter.id.trim()
      : null;
  if (!adapterId || fxAdapter?.authConfigured !== true) {
    return {
      status: 'configuration-incident',
      incident: buildFxConfigurationIncident(lease, transferReceipt, {
        now: observedAt,
      }),
    };
  }
  return {
    status: 'routed',
    writer: { kind: 'fx', id: adapterId },
    route: 'fx-backstop',
  };
}
function claimDirectory(stateDir, claimKey) {
  return join(stateDir, 'rolling-ci-ownership', claimKey);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, path);
}

async function withClaimLock(directory, operation) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, '.writer-lock');
  let handle;
  for (let attempt = 1; attempt <= 25; attempt += 1) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST' || attempt === 25) throw error;
      await new Promise(resolve => setTimeout(resolve, 2));
    }
  }
  try {
    return await operation();
  } finally {
    await handle?.close();
    await rm(lockPath, { force: true });
  }
}

function buildWriterClaim({ lease, writer, route, now, previous = null }) {
  const claim = {
    schema: WRITER_CLAIM_SCHEMA,
    claimKey: lease.claimKey,
    leaseKey: lease.leaseKey,
    repository: lease.repository,
    prNumber: lease.prNumber,
    headSha: lease.headSha,
    failureFingerprint: lease.failureFingerprint,
    writer,
    route,
    status: 'active',
    leaseIssuedAt: lease.issuedAt,
    claimedAt: now,
    previousWriterClaimKey: previous?.writerClaimKey ?? null,
  };
  return { ...claim, writerClaimKey: digest(claim) };
}
/**
 * Atomically acquire the only writer slot for one PR/root-cause pair.
 * `currentHeadSha` must come from the trusted dispatcher's fresh GitHub query.
 */
export async function acquireRemediationWriterClaim(
  input,
  { stateDir = DEFAULT_DELIVERY_STATE_DIR, now = new Date().toISOString() } = {}
) {
  const lease = assertLease(input.lease);
  const currentHeadSha = exactSha(input.currentHeadSha, 'currentHeadSha');
  if (currentHeadSha !== lease.headSha) {
    return { status: 'rejected', reason: 'stale-head' };
  }
  const route = routeRemediationOwner(input, { now });
  if (route.status !== 'routed') return route;
  const directory = claimDirectory(stateDir, lease.claimKey);
  const currentPath = join(directory, 'current.json');
  return withClaimLock(directory, async () => {
    const current = await readJson(currentPath);
    if (
      current?.status === 'active' &&
      current.headSha === lease.headSha &&
      current.writer?.id !== route.writer.id
    ) {
      return {
        status: 'conflict',
        reason: 'writer-already-claimed',
        claim: current,
      };
    }
    if (
      current?.status === 'active' &&
      current.headSha === lease.headSha &&
      current.writer?.id === route.writer.id
    ) {
      return { status: 'duplicate', claim: current };
    }
    if (
      current?.status === 'active' &&
      current.headSha !== lease.headSha &&
      Date.parse(lease.issuedAt) <= Date.parse(current.leaseIssuedAt)
    ) {
      return { status: 'rejected', reason: 'out-of-order-head' };
    }
    const claimedAt = instant(now, 'claimedAt');
    const superseded = current
      ? {
          ...current,
          status: 'superseded',
          supersededAt: claimedAt,
          supersededReason: 'new-head',
          supersessionReceiptKey: digest({
            writerClaimKey: current.writerClaimKey,
            supersededAt: claimedAt,
            reason: 'new-head',
            byHeadSha: lease.headSha,
          }),
        }
      : null;
    const claim = buildWriterClaim({
      lease,
      writer: route.writer,
      route: route.route,
      now: claimedAt,
      previous: current,
    });
    if (superseded) {
      await writeJsonAtomic(
        join(
          directory,
          'receipts',
          `${superseded.supersessionReceiptKey}.json`
        ),
        superseded
      );
    }
    await writeJsonAtomic(currentPath, claim);
    await writeJsonAtomic(
      join(directory, 'receipts', `${claim.writerClaimKey}.json`),
      claim
    );
    return {
      status: current ? 'superseded-and-acquired' : 'acquired',
      claim,
      superseded,
    };
  });
}
export async function supersedeRemediationWriterClaim(
  input,
  { stateDir = DEFAULT_DELIVERY_STATE_DIR, now = new Date().toISOString() } = {}
) {
  const identity = ownershipIdentity(input);
  if (input.checkConclusion !== 'success') {
    return { status: 'rejected', reason: 'green-proof-required' };
  }
  const claimKey = digest({
    repository: identity.repository,
    prNumber: identity.prNumber,
    failureFingerprint: identity.failureFingerprint,
  });
  const directory = claimDirectory(stateDir, claimKey);
  const currentPath = join(directory, 'current.json');
  return withClaimLock(directory, async () => {
    const current = await readJson(currentPath);
    if (!current || current.status !== 'active') {
      return { status: 'ignored', reason: 'no-active-claim' };
    }
    if (current.headSha !== identity.headSha) {
      return { status: 'rejected', reason: 'stale-head' };
    }
    const supersededAt = instant(now, 'supersededAt');
    const superseded = {
      ...current,
      status: 'superseded',
      supersededAt,
      supersededReason: 'green-rerun',
      supersessionReceiptKey: digest({
        writerClaimKey: current.writerClaimKey,
        supersededAt,
        reason: 'green-rerun',
      }),
    };
    await writeJsonAtomic(currentPath, superseded);
    await writeJsonAtomic(
      join(directory, 'receipts', `${superseded.supersessionReceiptKey}.json`),
      superseded
    );
    return { status: 'superseded', claim: superseded };
  });
}
export function authorizeRemediationMutation({
  claim,
  writerId,
  currentHeadSha,
  checkConclusion = 'failure',
}) {
  if (claim?.schema !== WRITER_CLAIM_SCHEMA || claim.status !== 'active') {
    return { authorized: false, reason: 'claim-not-active' };
  }
  if (claim.writer?.id !== writerId) {
    return { authorized: false, reason: 'writer-mismatch' };
  }
  if (exactSha(currentHeadSha, 'currentHeadSha') !== claim.headSha) {
    return { authorized: false, reason: 'superseded-head' };
  }
  if (checkConclusion === 'success') {
    return { authorized: false, reason: 'green-rerun' };
  }
  return { authorized: true, reason: 'exact-head-writer' };
}
