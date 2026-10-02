import { randomUUID } from 'node:crypto';
import { FLEET_SCOPES, type FleetActionId } from '@jovie/action-contracts';
import { describe, expect, it } from 'vitest';
import {
  type FleetBackend,
  type FleetControlOperation,
  FleetDispatcher,
  type FleetLinear,
  type FleetResult,
  type FleetState,
} from './dispatcher';
import { fleetArchiveKey, fleetHistoryPrefix } from './retention';

class ArchiveStore implements FleetBackend {
  records = new Map<string, unknown>();
  archiveReads = 0;
  commits = 0;
  rejectArchives = false;
  race?: () => void;
  async get(key: string) {
    if (key.includes(':archive:') || key.includes(':history:'))
      this.archiveReads++;
    return structuredClone(this.records.get(key) ?? null);
  }
  async setIfAbsent(key: string, value: unknown) {
    if (this.records.has(key)) return false;
    this.records.set(key, structuredClone(value));
    return true;
  }
  async compareAndSet(key: string, before: unknown, after: unknown) {
    const race = this.race;
    this.race = undefined;
    race?.();
    if (JSON.stringify(this.records.get(key)) !== JSON.stringify(before))
      return false;
    this.records.set(key, structuredClone(after));
    return true;
  }
  async compareAndSetWithRecords(
    key: string,
    before: unknown,
    after: unknown,
    rows: { key: string; value: unknown }[]
  ) {
    const race = this.race;
    this.race = undefined;
    race?.();
    if (this.rejectArchives) throw new Error('archive unavailable');
    if (JSON.stringify(this.records.get(key)) !== JSON.stringify(before))
      return false;
    for (const row of rows)
      if (
        this.records.has(row.key) &&
        JSON.stringify(this.records.get(row.key)) !== JSON.stringify(row.value)
      )
        throw new Error('immutable archive conflict');
    this.records.set(key, structuredClone(after));
    for (const row of rows)
      this.records.set(row.key, structuredClone(row.value));
    this.commits++;
    return true;
  }
  async listRecords(prefix: string, after: string | undefined, limit: number) {
    this.archiveReads++;
    return [...this.records]
      .filter(([key]) => key.startsWith(prefix) && (!after || key > after))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, limit)
      .map(([key, value]) => ({ key, value: structuredClone(value) }));
  }
}
function data(result: FleetResult) {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error(JSON.stringify(result));
  return result.data;
}
async function fixture(linear?: FleetLinear) {
  const profile = randomUUID();
  const key = `ovie:mcp:v1:fleet:${profile}`;
  const store = new ArchiveStore();
  let now = Date.parse('2026-10-02T12:00:00Z');
  const dispatcher = new FleetDispatcher({
    backend: store,
    linear,
    enabled: true,
    now: () => now,
  });
  const control = async (operation: FleetControlOperation, input: unknown) =>
    dispatcher.control(
      profile,
      'founder',
      await dispatcher.approve(profile, 'founder', operation, input),
      operation,
      input
    );
  const invoke = (
    id: FleetActionId,
    input: unknown,
    token: string,
    idempotencyKey = randomUUID(),
    d = dispatcher
  ) =>
    d.invoke(
      id,
      {
        schemaVersion: 1,
        context: { profileId: profile, channel: 'cli' },
        input,
        idempotencyKey,
      },
      token
    );
  const registration = (workerId: string, availability = 'available') => ({
    workerId,
    runtimeClass: 'node',
    capabilities: ['api.openapi'],
    tools: [],
    connectors: [],
    availability,
  });
  const credential = (workerId: string) => ({
    workerId,
    scopes: FLEET_SCOPES,
    expiresAt: new Date(now + 86400000).toISOString(),
    authority: {
      identity: {
        provider: 'fixture',
        accountRef: `urn:account:${workerId}`,
        runtimeRef: `urn:runtime:${workerId}`,
        displayName: workerId,
        role: 'operator',
        attestationRef: 'urn:fixture:founder',
      },
      visibility: 'fleet',
      allowedCommands: ['api.openapi'],
      allowedTools: [],
      allowedConnectors: [],
      maxDurationSeconds: 60,
      maxConcurrentLeases: 1,
      spendUsd: 0,
    },
  });
  const provision = async (worker: string) => {
    const token = String(
      (await control('provision', credential(worker))).token
    );
    data(await invoke('fleet.register', registration(worker), token));
    return token;
  };
  const token = await provision('helper');
  const mission = (missionId: string = randomUUID()) => ({
    missionId,
    issueId: 'JOV-7393',
    title: 'Contract read',
    acceptanceCriteria: ['Read public contract'],
    owner: 'Summer',
    existingWorkRefs: [],
    command: 'api.openapi' as const,
    requiredTools: [],
    requiredConnectors: [],
    targetWorkerId: 'helper',
    maxDurationSeconds: 60,
    notAfter: new Date(now + 3600000).toISOString(),
    founderIntentRef: 'urn:fixture:mission',
  });
  const state = () => structuredClone(store.records.get(key)) as FleetState;
  const seed = (fn: (s: FleetState) => void) => {
    const s = state();
    fn(s);
    store.records.set(key, s);
  };
  const fillInvocations = (count = 4000) =>
    seed(s => {
      const original = Object.values(s.invocations)[0];
      for (let i = Object.keys(s.invocations).length; i < count; i++)
        s.invocations[`filler-${i}`] = structuredClone(original);
    });
  return {
    profile,
    key,
    store,
    dispatcher,
    control,
    invoke,
    registration,
    credential,
    provision,
    token,
    mission,
    state,
    seed,
    fillInvocations,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

async function defectInput(f: Awaited<ReturnType<typeof fixture>>) {
  await f.control('assign', f.mission());
  const { leaseId } = data(await f.invoke('work.next', {}, f.token)).lease as {
    leaseId: string;
  };
  data(await f.invoke('work.claim', { leaseId }, f.token));
  return {
    leaseId,
    title: 'Contract mismatch',
    command: 'api.openapi',
    apiCode: 'MISMATCH',
    details: 'Evidence',
    evidence: [{ ref: 'urn:fixture:read', summary: 'Read' }],
  };
}

describe('fleet archival preserves authority and durable outcomes beyond lifetime caps', () => {
  it('paginates mixed-case request identifiers with the same order as its cursor', async () => {
    const f = await fixture();
    const ids = Array.from(
      { length: 20 },
      (_, i) =>
        `${i % 2 ? 'a' : 'B'}0000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    );
    f.seed(s => {
      for (const requestId of ids) {
        const {
          missionId: _id,
          owner: _owner,
          founderIntentRef: _ref,
          ...proposal
        } = f.mission(requestId);
        proposal.acceptanceCriteria = Array.from({ length: 10 }, () =>
          '文'.repeat(500)
        );
        s.requests[requestId] = {
          requestId,
          kind: 'help',
          proposal,
          requesterWorkerId: 'requester',
          createdAt: new Date(f.now()).toISOString(),
          state: 'accepted',
        };
        s.requestWorkers[requestId] = ['helper'];
      }
    });
    const seen: string[] = [];
    let requestsAfter: string | undefined;
    do {
      const page = data(
        await f.invoke('fleet.status', { requestsAfter }, f.token)
      );
      seen.push(
        ...(page.requests as { requestId: string }[]).map(r => r.requestId)
      );
      requestsAfter = page.requestsNextCursor as string | undefined;
    } while (requestsAfter);
    expect(seen).toEqual([...ids].sort());
  });

  it('keeps archived defect identity immutable when Linear changes its display URL', async () => {
    let url = 'https://linear.app/jovie/issue/JOV-7393/original';
    const f = await fixture({
      find: async (fingerprint, issueId) => ({
        fingerprint,
        issueId,
        identifier: 'JOV-7393',
        url,
      }),
      create: async () => {
        throw new Error('existing issue expected');
      },
      append: async () => {},
    });
    const input = await defectInput(f);
    const original = data(await f.invoke('defect.report', input, f.token));
    const fillDefects = () =>
      f.seed(s => {
        for (let i = 0; i < 150; i++)
          s.defects[`filler-${i}`] = {
            ...original,
            fingerprint: `filler-${i}`,
          } as FleetState['defects'][string];
      });
    fillDefects();
    data(await f.invoke('fleet.status', {}, f.token));
    const archiveKey = fleetArchiveKey(
      f.profile,
      'defects',
      String(original.fingerprint)
    );
    const archived = structuredClone(f.store.records.get(archiveKey));
    expect(archived).toBeDefined();
    url = 'https://linear.app/jovie/issue/JOV-7393/renamed';
    expect(data(await f.invoke('defect.report', input, f.token)).url).toBe(url);
    expect(f.state().defects[String(original.fingerprint)]).toBeUndefined();
    fillDefects();
    data(await f.invoke('fleet.status', {}, f.token));
    expect(f.store.records.get(archiveKey)).toEqual(archived);
  });

  it('archives abandoned contention waiters and preserves their payload binding, retry, and eventual exact result', async () => {
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    let release!: () => void;
    const hold = new Promise<void>(resolve => {
      release = resolve;
    });
    let finds = 0;
    const f = await fixture({
      find: async (fingerprint, issueId) => {
        if (++finds === 1) {
          signalStarted();
          await hold;
        }
        return {
          fingerprint,
          issueId,
          identifier: 'JOV-7393',
          url: 'https://linear.app/jovie/issue/JOV-7393',
        };
      },
      create: async () => {
        throw new Error('existing issue expected');
      },
      append: async () => {},
    });
    const input = await defectInput(f);
    const owner = f.invoke('defect.report', input, f.token);
    await started;
    const waiterKey = randomUUID();
    expect(
      await f.invoke('defect.report', input, f.token, waiterKey)
    ).toMatchObject({ status: 'in_progress' });
    release();
    data(await owner);
    const waiterId = Object.entries(f.state().invocations).find(
      ([, value]) => value.result?.status === 'in_progress'
    )![0];
    f.fillInvocations();
    data(await f.invoke('fleet.status', {}, f.token));
    expect(f.state().invocations[waiterId]).toBeUndefined();
    expect(
      f.store.records.get(
        fleetArchiveKey(f.profile, 'invocationRetries', waiterId)
      )
    ).toMatchObject({ value: { hash: expect.any(String) } });
    expect(
      await f.invoke(
        'defect.report',
        { ...input, details: 'Changed' },
        f.token,
        waiterKey
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    const completed = await f.invoke(
      'defect.report',
      input,
      f.token,
      waiterKey
    );
    data(completed);
    f.seed(s => {
      s.invocations = { [waiterId]: s.invocations[waiterId], ...s.invocations };
    });
    data(await f.invoke('fleet.status', {}, f.token));
    expect(f.state().invocations[waiterId]).toBeUndefined();
    expect(await f.invoke('defect.report', input, f.token, waiterKey)).toEqual(
      completed
    );
    expect(finds).toBe(2);
  });

  it('pages large terminal outcomes below the CLI response limit and stores no refreshable snapshots', async () => {
    const f = await fixture();
    f.seed(s => {
      for (let i = 0; i < 40; i++) {
        const receiptId = randomUUID(),
          leaseId = randomUUID();
        s.receipts[receiptId] = {
          receiptId,
          leaseId,
          missionId: randomUUID(),
          workerId: 'helper',
          outcome: 'completed',
          summary: '文'.repeat(2000),
          evidence: Array.from({ length: 10 }, () => ({
            ref: 'urn:fixture:read',
            summary: '文'.repeat(1000),
          })),
          reportedAt: new Date(f.now()).toISOString(),
          durationMs: 1,
        };
      }
    });
    const ids = new Set<string>();
    let after = 0;
    for (;;) {
      const result = await f.invoke(
        'fleet.status',
        { historyAfter: after, historyLimit: 100 },
        f.token
      );
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(
        1024 * 1024
      );
      const page = data(result).history as {
        entries: { kind: string; receipt: { receiptId: string } }[];
        nextCursor: number | null;
      };
      for (const entry of page.entries)
        if (entry.kind === 'receipt') ids.add(entry.receipt.receiptId);
      if (page.nextCursor === null) break;
      after = page.nextCursor;
    }
    expect(ids.size).toBe(40);
    expect(
      Object.values(f.state().invocations)
        .filter(r => r.refresh)
        .every(r => !r.result)
    ).toBe(true);
    expect(
      Object.values(f.state().invocations).filter(r => r.refresh).length
    ).toBeGreaterThan(1);
  });

  it('admits a defect after reporting while the original lease remains valid, without orphaning its provider reservation', async () => {
    let appends = 0;
    const f = await fixture({
      find: async (fingerprint, issueId) => ({
        fingerprint,
        issueId,
        identifier: 'JOV-7393',
        url: 'https://linear.app/jovie/issue/JOV-7393',
      }),
      create: async () => {
        throw new Error('existing issue expected');
      },
      append: async () => {
        appends++;
      },
    });
    await f.control('assign', f.mission());
    const lease = data(await f.invoke('work.next', {}, f.token)).lease as {
      leaseId: string;
    };
    data(await f.invoke('work.claim', { leaseId: lease.leaseId }, f.token));
    const evidence = [{ ref: 'urn:fixture:read', summary: 'Read' }];
    data(
      await f.invoke(
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'completed',
          summary: 'Read',
          evidence,
        },
        f.token
      )
    );
    f.seed(s => {
      const original = s.leases[lease.leaseId];
      for (let i = 0; i < 999; i++) {
        const id = randomUUID();
        s.leases[id] = { ...original, leaseId: id };
        s.leaseCredentials[id] = s.leaseCredentials[lease.leaseId];
      }
    });
    data(
      await f.invoke(
        'defect.report',
        {
          leaseId: lease.leaseId,
          title: 'Contract mismatch',
          command: 'api.openapi',
          apiCode: 'MISMATCH',
          details: 'Mismatch evidence',
          evidence,
        },
        f.token
      )
    );
    expect(appends).toBe(1);
    expect(f.state().leases[lease.leaseId]).toBeDefined();
    expect(f.state().pendingDefects).toEqual({});
  });

  it('recovers full invocation state, preserves exact replay and hash conflicts across restart, and authenticates before archives', async () => {
    const f = await fixture();
    const key = randomUUID();
    const original = await f.invoke(
      'fleet.register',
      f.registration('helper'),
      f.token,
      key
    );
    f.fillInvocations();
    const commits = f.store.commits;
    const reads = f.store.archiveReads;
    expect(await f.invoke('fleet.status', {}, 'invalid')).toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });
    expect(f.store.commits).toBe(commits);
    expect(f.store.archiveReads).toBe(reads);
    expect(
      await f.invoke('fleet.register', f.registration('helper'), f.token, key)
    ).toEqual(original);
    expect(Object.keys(f.state().invocations).length).toBeLessThan(4000);
    expect(
      [...f.store.records.keys()].some(k => k.includes(':archive:invocations:'))
    ).toBe(true);
    const restarted = new FleetDispatcher({
      backend: f.store,
      enabled: true,
      now: f.now,
    });
    expect(
      await f.invoke(
        'fleet.register',
        f.registration('helper'),
        f.token,
        key,
        restarted
      )
    ).toEqual(original);
    expect(
      await f.invoke(
        'fleet.register',
        f.registration('helper', 'busy'),
        f.token,
        key
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    const replacement = String(
      (await f.control('rotate', f.credential('helper'))).token
    );
    const beforeDenied = f.store.archiveReads;
    expect(
      await f.invoke('fleet.register', f.registration('helper'), f.token, key)
    ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    expect(f.store.archiveReads).toBe(beforeDenied);
    const renewed = data(
      await f.invoke(
        'fleet.register',
        f.registration('helper', 'busy'),
        replacement,
        key
      )
    );
    expect(renewed.worker).toMatchObject({ availability: 'busy' });
  });

  it('refreshes archived status and directory views while retaining their exact payload binding', async () => {
    const f = await fixture();
    const statusKey = randomUUID(),
      directoryKey = randomUUID();
    data(await f.invoke('fleet.status', {}, f.token, statusKey));
    data(await f.invoke('fleet.directory', {}, f.token, directoryKey));
    f.fillInvocations();
    data(
      await f.invoke(
        'fleet.register',
        f.registration('helper', 'busy'),
        f.token
      )
    );
    expect(
      data(await f.invoke('fleet.status', {}, f.token, statusKey)).worker
    ).toMatchObject({ availability: 'busy' });
    f.fillInvocations();
    expect(
      data(await f.invoke('fleet.directory', {}, f.token, directoryKey)).workers
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ availability: 'busy' }),
      ])
    );
    data(await f.invoke('fleet.status', {}, f.token, statusKey));
    expect(
      await f.invoke('fleet.status', { historyAfter: 1 }, f.token, statusKey)
    ).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('retains terminal requester outcomes and receipt replay with isolated, bounded history after mission/request/receipt capacity is reached', async () => {
    const f = await fixture();
    const requester = await f.provision('requester'),
      outsider = await f.provision('outsider');
    const mission = f.mission();
    const {
      missionId,
      owner: _owner,
      founderIntentRef: _intent,
      ...proposal
    } = mission;
    const request = { requestId: missionId, kind: 'help', proposal };
    data(await f.invoke('work.request', request, requester));
    await f.control('accept', {
      requestId: missionId,
      owner: 'Summer',
      founderIntentRef: 'urn:fixture:accept',
    });
    const lease = data(await f.invoke('work.next', {}, f.token)).lease as {
      leaseId: string;
    };
    data(await f.invoke('work.claim', { leaseId: lease.leaseId }, f.token));
    const report = {
      leaseId: lease.leaseId,
      outcome: 'completed',
      summary: 'Read',
      evidence: [{ ref: 'urn:fixture:read', summary: 'Contract read' }],
    };
    const receipt = data(
      await f.invoke('work.report', report, f.token)
    ).receipt;
    f.advance(60001);
    f.seed(s => {
      const originalMission = mission as FleetState['missions'][string],
        originalLease = s.leases[lease.leaseId],
        originalReceipt = Object.values(s.receipts)[0],
        originalRequest = {
          ...request,
          requesterWorkerId: 'requester',
          createdAt: new Date(f.now()).toISOString(),
          state: 'accepted',
        } as FleetState['requests'][string];
      for (let i = 1; i < 1000; i++) {
        const id = randomUUID(),
          l = randomUUID(),
          r = randomUUID();
        const m = { ...originalMission, missionId: id };
        if (i < 200) {
          s.missions[id] = m;
          s.requests[id] = { ...originalRequest, requestId: id };
        }
        s.leases[l] = { ...originalLease, leaseId: l, mission: m };
        s.leaseCredentials[l] = s.leaseCredentials[lease.leaseId];
        s.receipts[r] = {
          ...originalReceipt,
          receiptId: r,
          missionId: id,
          leaseId: l,
        };
      }
    });
    for (let i = 0; i < 8; i++)
      data(await f.invoke('fleet.status', {}, f.token));
    expect(Object.keys(f.state().missions).length).toBeLessThan(200);
    expect(Object.keys(f.state().requests).length).toBeLessThan(200);
    expect(Object.keys(f.state().leases).length).toBeLessThan(1000);
    expect(Object.keys(f.state().receipts).length).toBeLessThan(1000);
    expect(
      f.store.records.has(fleetArchiveKey(f.profile, 'receipts', lease.leaseId))
    ).toBe(true);
    expect(
      data(await f.invoke('work.report', report, f.token)).receipt
    ).toEqual(receipt);
    expect(
      await f.invoke(
        'work.report',
        { ...report, summary: 'Different' },
        f.token
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(
      data(await f.invoke('work.request', request, requester)).request
    ).toMatchObject({ state: 'completed', receipt });
    expect(
      await f.invoke(
        'work.request',
        { ...request, proposal: { ...proposal, title: 'Changed' } },
        requester
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    await expect(f.control('assign', mission)).rejects.toThrow('CONFLICT');
    const history: unknown[] = [];
    let cursor = 0;
    for (;;) {
      const page = data(
        await f.invoke(
          'fleet.status',
          { historyAfter: cursor, historyLimit: 17 },
          requester
        )
      ).history as { entries: unknown[]; nextCursor: number | null };
      expect(page.entries.length).toBeLessThanOrEqual(17);
      history.push(...page.entries);
      if (page.nextCursor === null) break;
      expect(page.nextCursor).toBeGreaterThan(cursor);
      cursor = page.nextCursor;
    }
    expect(history).toHaveLength(200);
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'request',
          request: expect.objectContaining({
            requestId: missionId,
            state: 'completed',
            receipt,
          }),
        }),
      ])
    );
    expect(
      data(await f.invoke('fleet.status', { historyLimit: 100 }, outsider))
        .history
    ).toMatchObject({ entries: [], nextCursor: null });
    expect(
      [...f.store.records.keys()].some(k =>
        k.startsWith(fleetHistoryPrefix(f.profile, 'requester'))
      )
    ).toBe(true);
  });

  it('reclaims expired offers for one still-live mission without losing historical helper visibility', async () => {
    const f = await fixture();
    const requester = await f.provision('requester');
    const mission = f.mission();
    const {
      missionId,
      owner: _owner,
      founderIntentRef: _intent,
      ...proposal
    } = mission;
    data(
      await f.invoke(
        'work.request',
        { requestId: missionId, kind: 'help', proposal },
        requester
      )
    );
    await f.control('accept', {
      requestId: missionId,
      owner: 'Summer',
      founderIntentRef: 'urn:fixture:accept',
    });
    const original = data(await f.invoke('work.next', {}, f.token))
      .lease as FleetState['leases'][string];
    f.advance(60001);
    f.seed(s => {
      for (let i = 1; i < 1000; i++) {
        const id = randomUUID();
        s.leases[id] = { ...original, leaseId: id };
        s.leaseCredentials[id] = s.leaseCredentials[original.leaseId];
      }
    });
    const next = data(await f.invoke('work.next', {}, f.token)).lease as {
      leaseId: string;
    };
    expect(next.leaseId).not.toBe(original.leaseId);
    expect(Object.keys(f.state().leases).length).toBeLessThan(1000);
    expect(f.state().missions[missionId]).toBeDefined();
    expect(data(await f.invoke('fleet.status', {}, f.token)).requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requestId: missionId }),
      ])
    );
  });

  it('fails closed on archive failure or fully-live capacity without deleting hot evidence', async () => {
    const f = await fixture();
    f.fillInvocations();
    const before = f.state();
    f.store.rejectArchives = true;
    expect(await f.invoke('fleet.status', {}, f.token)).toMatchObject({
      error: { code: 'TEMPORARILY_UNAVAILABLE' },
    });
    expect(f.state()).toEqual(before);
    f.store.rejectArchives = false;
    f.seed(s => {
      for (const [invocationId, record] of Object.entries(s.invocations)) {
        record.result = {
          status: 'in_progress',
          receipt: record.result!.receipt,
          retryAfterMs: 30000,
        };
        s.pendingDefects[invocationId] = {
          attemptId: randomUUID(),
          fingerprint: invocationId,
          issueId: randomUUID(),
          input: {},
          leaseId: randomUUID(),
          workerId: 'helper',
          startedAt: new Date(f.now()).toISOString(),
          invocationId,
          hash: record.hash,
          receipt: record.result.receipt,
        };
      }
    });
    expect(await f.invoke('fleet.status', {}, f.token)).toMatchObject({
      error: { code: 'QUOTA_EXHAUSTED' },
    });
    expect(Object.keys(f.state().invocations)).toHaveLength(4000);
  });

  it('re-authenticates an archived replay when a concurrent rotation defeats its snapshot CAS', async () => {
    const f = await fixture();
    const invocationKey = randomUUID();
    data(
      await f.invoke(
        'fleet.register',
        f.registration('helper'),
        f.token,
        invocationKey
      )
    );
    f.fillInvocations();
    data(await f.invoke('fleet.status', {}, f.token));
    f.store.race = () =>
      f.seed(s => {
        s.credentials.helper.revokedAt = new Date(f.now()).toISOString();
      });
    expect(
      await f.invoke(
        'fleet.register',
        f.registration('helper'),
        f.token,
        invocationKey
      )
    ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });
});
