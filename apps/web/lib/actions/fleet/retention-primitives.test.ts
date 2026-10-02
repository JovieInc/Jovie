import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FleetResult, FleetState } from './dispatcher';
import {
  compactFleetState,
  fleetArchiveKey,
  fleetHistoryPrefix,
  readArchiveValue,
} from './retention';

const now = Date.parse('2026-10-02T12:00:00Z');
const iso = (offset = 0) => new Date(now + offset).toISOString();
function state(): FleetState {
  return {
    schema: 'jovie.summer.fleet/v1',
    credentials: {},
    workers: {},
    missions: {},
    leases: {},
    leaseCredentials: {},
    historySequences: {},
    requestWorkers: {},
    receiptHistoryRecorded: {},
    receipts: {},
    invocations: {},
    defects: {},
    pendingDefects: {},
    requests: {},
    approvals: {},
  };
}
function invocation(actionId = 'fleet.register'): FleetResult {
  return {
    status: 'completed',
    receipt: {
      executionId: randomUUID(),
      requestId: randomUUID(),
      actionId,
      schemaVersion: 1,
      channel: 'cli',
      status: 'completed',
      startedAt: iso(),
    },
    data: {},
  };
}
function work(s: FleetState, expiresIn = 60000) {
  const mission: FleetState['missions'][string] = {
    missionId: randomUUID(),
    issueId: 'JOV-7393',
    title: 'Synthetic mission',
    acceptanceCriteria: ['Persist a receipt'],
    owner: 'Summer',
    existingWorkRefs: [],
    command: 'api.openapi',
    requiredTools: [],
    requiredConnectors: [],
    targetWorkerId: 'helper',
    maxDurationSeconds: 60,
    notAfter: iso(3600000),
    founderIntentRef: 'urn:fixture:mission',
  };
  const lease: FleetState['leases'][string] = {
    leaseId: randomUUID(),
    workerId: 'helper',
    mission,
    state: 'reported',
    offeredAt: iso(-60000),
    claimedAt: iso(-60000),
    expiresAt: iso(expiresIn),
  };
  const receipt: FleetState['receipts'][string] = {
    receiptId: randomUUID(),
    workerId: 'helper',
    missionId: mission.missionId,
    leaseId: lease.leaseId,
    outcome: 'completed',
    summary: 'Synthetic receipt',
    evidence: [],
    reportedAt: iso(),
    durationMs: 1000,
  };
  s.missions[mission.missionId] = mission;
  s.leases[lease.leaseId] = lease;
  s.leaseCredentials[lease.leaseId] = 'synthetic-issuance';
  s.receipts[receipt.receiptId] = receipt;
  return { mission, lease, receipt };
}

describe('fleet compaction primitives', () => {
  it('bounds each immutable batch while retaining unpublished receipts and thin refresh bindings', () => {
    const s = state();
    for (let index = 0; index < 4000; index++) {
      s.invocations[`invocation-${index}`] = {
        hash: `payload-${index}`,
        result: invocation(index === 0 ? 'fleet.status' : 'fleet.register'),
      };
    }
    for (let index = 0; index < 200; index++) work(s);
    const rows = compactFleetState('profile', s, now);
    expect(rows).toHaveLength(250);
    expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
    expect(Object.keys(s.invocations)).toHaveLength(3900);
    expect(Object.keys(s.receipts)).toHaveLength(200);
    expect(Object.keys(s.receiptHistoryRecorded)).toHaveLength(75);
    expect(s.historySequences.helper).toBe(75);
    const refresh = rows.find(
      row =>
        row.key === fleetArchiveKey('profile', 'invocations', 'invocation-0')
    );
    expect(refresh?.value).toMatchObject({
      value: { hash: 'payload-0', refresh: true },
    });
    expect(
      readArchiveValue<{ result?: unknown }>(
        refresh?.value,
        'invocations',
        'invocation-0'
      )
    ).not.toHaveProperty('result');
    expect(compactFleetState('profile', s, now)).toHaveLength(250);
    expect(Object.keys(s.receiptHistoryRecorded)).toHaveLength(150);
    expect(s.historySequences.helper).toBe(150);
  });

  it('retains pending provider evidence, pending Summer deliveries and unexpired reported leases under pressure', () => {
    const s = state();
    const pending = work(s, -1);
    const delivery = work(s, -1);
    const unexpired = work(s);
    const expired = work(s, -1);
    s.summer = {
      events: {
        [delivery.mission.missionId]: {
          requestId: delivery.mission.missionId,
          eventId: delivery.mission.missionId,
          delegationId: randomUUID(),
          requestHash: 'pending-proposal',
          createdAt: iso(-60000),
          expiresAt: iso(-1),
          state: 'pending',
        },
      },
    };
    const result = invocation();
    s.invocations.pinned = { hash: 'pinned-payload', result };
    s.invocations.running = {
      hash: 'running-payload',
      result: {
        status: 'in_progress',
        receipt: result.receipt,
        retryAfterMs: 1000,
      },
    };
    for (let index = 2; index < 3000; index++) {
      s.invocations[`invocation-${index}`] = { hash: String(index), result };
    }
    s.pendingDefects.fingerprint = {
      attemptId: randomUUID(),
      fingerprint: 'fingerprint',
      issueId: randomUUID(),
      input: {},
      leaseId: pending.lease.leaseId,
      workerId: 'helper',
      startedAt: iso(),
      invocationId: 'pinned',
      hash: 'pinned-payload',
      receipt: result.receipt,
    };
    s.pendingDefects.otherFingerprint = {
      ...s.pendingDefects.fingerprint,
      fingerprint: 'otherFingerprint',
      invocationId: 'running',
      hash: 'running-payload',
    };
    for (let index = 4; index < 750; index++) {
      const leaseId = randomUUID();
      s.leases[leaseId] = { ...expired.lease, leaseId };
    }
    const rows = compactFleetState('profile', s, now);
    expect(rows.length).toBeLessThanOrEqual(250);
    expect(s.invocations.pinned).toBeDefined();
    expect(s.invocations.running.result?.status).toBe('in_progress');
    for (const { lease, mission } of [pending, delivery]) {
      expect(s.leases[lease.leaseId]).toBeDefined();
      expect(s.missions[mission.missionId]).toBeDefined();
    }
    expect(s.leases[unexpired.lease.leaseId]).toBeDefined();
    expect(s.summer.events[delivery.mission.missionId].state).toBe('pending');
    expect(s.leases[expired.lease.leaseId]).toBeUndefined();
    expect(s.leaseCredentials[expired.lease.leaseId]).toBeUndefined();
    expect(
      rows.find(
        row =>
          row.key ===
          fleetArchiveKey('profile', 'leases', expired.lease.leaseId)
      )?.value
    ).toMatchObject({
      value: {
        lease: expired.lease,
        credentialId: 'synthetic-issuance',
      },
    });
  });

  it('preserves terminal requester outcomes and each historical worker audience without duplicating receipt history', () => {
    const s = state();
    const { mission, lease, receipt } = work(s);
    const {
      missionId,
      owner: _owner,
      founderIntentRef: _intent,
      ...proposal
    } = mission;
    s.requests[missionId] = {
      requestId: missionId,
      kind: 'help',
      proposal,
      requesterWorkerId: 'requester',
      createdAt: iso(-60000),
      state: 'accepted',
    };
    s.requestWorkers[missionId] = ['prior-helper', 'helper'];
    s.summer = {
      events: {
        [missionId]: {
          requestId: missionId,
          eventId: missionId,
          delegationId: randomUUID(),
          requestHash: 'completed-proposal',
          createdAt: iso(-60000),
          expiresAt: iso(60000),
          state: 'completed',
        },
      },
    };
    const rows = compactFleetState('profile', s, now);
    expect(s.requests[missionId]).toBeUndefined();
    expect(s.missions[missionId]).toBeUndefined();
    expect(s.summer.events[missionId]).toBeUndefined();
    expect(s.leases[lease.leaseId]).toBeDefined();
    expect(
      rows.find(
        row => row.key === fleetArchiveKey('profile', 'requests', missionId)
      )?.value
    ).toMatchObject({ value: { state: 'completed', receipt } });
    for (const worker of ['requester', 'helper', 'prior-helper']) {
      expect(
        rows
          .filter(row =>
            row.key.startsWith(fleetHistoryPrefix('profile', worker))
          )
          .some(row => (row.value as { kind: string }).kind === 'request')
      ).toBe(true);
    }
    expect(s.historySequences).toEqual({
      helper: 2,
      requester: 1,
      'prior-helper': 1,
    });
    expect(compactFleetState('profile', s, now)).toEqual([]);
    expect(s.historySequences.helper).toBe(2);
  });
});
