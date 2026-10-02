import { randomUUID } from 'node:crypto';
import {
  FLEET_SCOPES,
  type FleetActionId,
  fleetLeaseSchema,
} from '@jovie/action-contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  type FleetBackend,
  type FleetControlOperation,
  FleetDispatcher,
  type FleetResult,
} from './dispatcher';
import { handleFleetControl, handleFleetInvocation } from './http';
import { summerDelegationInputSchema } from './summer';
import { handleSummerFleetEvents } from './summer-http';

const profileId = '11111111-1111-4111-a111-111111111111';
const foreignProfile = '22222222-2222-4222-a222-222222222222';
function completed(result: FleetResult) {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed')
    throw new Error('Expected completed result');
  return result.data;
}
function fixture(scope = profileId, archival = false) {
  const profileId = scope;
  let now = Date.parse('2026-10-02T18:00:00Z');
  const records = new Map<string, unknown>();
  const backend: FleetBackend = {
    async get(key) {
      return structuredClone(records.get(key) ?? null);
    },
    async setIfAbsent(key, value) {
      if (records.has(key)) return false;
      records.set(key, structuredClone(value));
      return true;
    },
    async compareAndSet(key, before, after) {
      if (JSON.stringify(before) !== JSON.stringify(records.get(key)))
        return false;
      records.set(key, structuredClone(after));
      return true;
    },
  };
  if (archival) {
    backend.compareAndSetWithRecords = async (key, before, after, rows) => {
      if (JSON.stringify(before) !== JSON.stringify(records.get(key)))
        return false;
      for (const row of rows)
        if (
          records.has(row.key) &&
          JSON.stringify(records.get(row.key)) !== JSON.stringify(row.value)
        )
          throw new Error('immutable archive conflict');
      records.set(key, structuredClone(after));
      for (const row of rows) records.set(row.key, structuredClone(row.value));
      return true;
    };
    backend.listRecords = async (prefix, after, limit) =>
      [...records]
        .filter(([key]) => key.startsWith(prefix) && (!after || key > after))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit)
        .map(([key, value]) => ({ key, value: structuredClone(value) }));
  }
  const restart = () =>
    new FleetDispatcher({ backend, enabled: true, now: () => now });
  const dispatcher = restart();
  const control = async (operation: FleetControlOperation, input: unknown) =>
    dispatcher.control(
      profileId,
      'founder',
      await dispatcher.approve(profileId, 'founder', operation, input),
      operation,
      input
    );
  const envelope = (input: unknown, idempotencyKey: string = randomUUID()) => ({
    schemaVersion: 1,
    idempotencyKey,
    context: { profileId, channel: 'cli' },
    input,
  });
  const invoke = (
    action: FleetActionId,
    input: unknown,
    token: string,
    key?: string
  ) => dispatcher.invoke(action, envelope(input, key), token);
  const agent = async (
    workerId: string,
    role: 'operator' | 'customer' = 'operator'
  ) => {
    const result = await control('provision', {
      workerId,
      scopes: FLEET_SCOPES,
      expiresAt: new Date(now + 86400000).toISOString(),
      authority: {
        identity: {
          provider: 'codex',
          accountRef: `urn:account:${workerId}`,
          runtimeRef: `urn:runtime:${workerId}`,
          displayName: workerId,
          role,
          attestationRef: 'urn:founder:identity-proof',
        },
        visibility: 'fleet',
        allowedCommands: ['api.openapi'],
        allowedTools: ['jovie'],
        allowedConnectors: [],
        maxDurationSeconds: 60,
        maxConcurrentLeases: 1,
        spendUsd: 0,
      },
    });
    const token = String(result.token);
    const registration = {
      workerId,
      runtimeClass: 'codex',
      capabilities: ['api.openapi'],
      tools: ['jovie'],
      connectors: [],
      availability: 'available',
    };
    completed(await invoke('fleet.register', registration, token));
    return { token, registration };
  };
  const delegation = (overrides = {}) => ({
    workerIds: ['requester', 'helper'],
    issueIds: ['JOV-7393'],
    allowedCommands: ['api.openapi'],
    maxDurationSeconds: 60,
    maxAdmissions: 5,
    spendUsd: 0,
    expiresAt: new Date(now + 3600000).toISOString(),
    owner: 'Summer',
    founderIntentRef: 'urn:founder:fleet-canary',
    ...overrides,
  });
  const request = (overrides = {}) => ({
    requestId: randomUUID(),
    kind: 'dogfood',
    proposal: {
      issueId: 'JOV-7393',
      title: 'Verify public API',
      acceptanceCriteria: ['Contract returned'],
      existingWorkRefs: ['urn:work:existing-canary'],
      command: 'api.openapi',
      requiredTools: ['jovie'],
      requiredConnectors: [],
      targetWorkerId: 'helper',
      maxDurationSeconds: 60,
      notAfter: new Date(now + 3600000).toISOString(),
      ...overrides,
    },
  });
  const validateMission = vi.fn(async () => true);
  const profiles = vi.fn(async () => [profileId]);
  const authenticate = vi.fn(
    async (incoming: Request) =>
      incoming.headers.get('authorization') === 'Bearer summer-production-oidc'
  );
  const http = (current = dispatcher) => ({
    authenticate,
    profiles,
    dispatcher: current,
    validateMission,
  });
  const incoming = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://jov.ie/api/internal/ovie/fleet/events', {
      method: 'POST',
      headers: { authorization: 'Bearer summer-production-oidc', ...headers },
      body: JSON.stringify(body),
    });
  const process = (eventId: string) =>
    handleSummerFleetEvents(
      incoming({ operation: 'process', profileId, eventId }),
      http()
    );
  return {
    dispatcher,
    control,
    envelope,
    invoke,
    agent,
    delegation,
    request,
    validateMission,
    profiles,
    authenticate,
    http,
    incoming,
    process,
    restart,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
async function commissioned(scope = profileId, archival = false) {
  const f = fixture(scope, archival);
  const requester = await f.agent('requester');
  const helper = await f.agent('helper');
  await f.control('delegate', f.delegation());
  return { ...f, requester, helper };
}

describe('delegated Summer fleet event admission', () => {
  it('keeps delegation issue identifiers restricted to canonical positive Jovie IDs', () => {
    const input = fixture().delegation();
    for (const issueId of ['JOV-1', 'JOV-7393']) {
      expect(
        summerDelegationInputSchema.safeParse({ ...input, issueIds: [issueId] })
          .success
      ).toBe(true);
    }
    for (const issueId of [
      'JOV-0',
      'JOV-01',
      'JOV-1x',
      'LYB-1',
      'JOV--1',
      ' JOV-1',
      'JOV-1 ',
    ]) {
      expect(
        summerDelegationInputSchema.safeParse({ ...input, issueIds: [issueId] })
          .success
      ).toBe(false);
    }
  });
  it('replays the immutable rejection when concurrent validation outlives archival', async () => {
    const f = await commissioned(profileId, true);
    const input = f.request();
    completed(await f.invoke('work.request', input, f.requester.token));
    let release!: (valid: boolean) => void;
    const delayed = new Promise<boolean>(resolve => {
      release = resolve;
    });
    f.validateMission.mockReturnValueOnce(delayed).mockResolvedValueOnce(false);
    const first = f.process(input.requestId);
    await vi.waitFor(() => expect(f.validateMission).toHaveBeenCalledTimes(1));
    const second = await f.process(input.requestId);
    expect(second.status).toBe(200);
    const rejection = await second.json();
    expect(rejection.result.receipt.outcome).toBe('rejected');
    expect(
      (await f.dispatcher.inspect(profileId)).summer?.events[input.requestId]
    ).toBeUndefined();
    release(false);
    const replay = await first;
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(rejection);
    expect((await f.dispatcher.inspect(profileId)).missions).toEqual([]);
  });

  it('replays an archived decision after restart and renewal without reusing its request identity', async () => {
    const f = await commissioned(profileId, true);
    const input = f.request();
    completed(await f.invoke('work.request', input, f.requester.token));
    const original = await (await f.process(input.requestId)).json();
    const lease = fleetLeaseSchema.parse(
      completed(await f.invoke('work.next', {}, f.helper.token)).lease
    );
    completed(
      await f.invoke('work.claim', { leaseId: lease.leaseId }, f.helper.token)
    );
    completed(
      await f.invoke(
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'completed',
          summary: 'Public contract verified',
          evidence: [
            {
              ref: 'https://jov.ie/api/v1/openapi.json',
              summary: 'Public read',
            },
          ],
        },
        f.helper.token
      )
    );
    expect(
      (await f.dispatcher.inspect(profileId)).summer?.events[input.requestId]
    ).toBeUndefined();
    await f.control(
      'delegate',
      f.delegation({ founderIntentRef: 'urn:founder:renewed-canary' })
    );
    const replay = await handleSummerFleetEvents(
      f.incoming({ operation: 'process', profileId, eventId: input.requestId }),
      f.http(f.restart())
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(original);
    expect(f.validateMission).toHaveBeenCalledTimes(1);
    expect(
      (await f.dispatcher.inspect(profileId)).summer?.delegation?.admissions
    ).toBe(0);
    const history = completed(
      await f.invoke('fleet.status', { historyAfter: 0 }, f.requester.token)
    );
    expect(history.requests).toMatchObject([
      { requestId: input.requestId, state: 'completed' },
    ]);
    completed(await f.invoke('work.request', input, f.requester.token));
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toEqual([]);
    const changed = await f.invoke(
      'work.request',
      { ...input, proposal: { ...input.proposal, title: 'Reused identity' } },
      f.requester.token
    );
    expect(changed).toMatchObject({
      status: 'unavailable',
      error: { code: 'CONFLICT' },
    });
    expect((await f.dispatcher.inspect(profileId)).missions).toEqual([]);
  });

  it('repairs across profiles even when the first profile has five blocked events', async () => {
    const first = await commissioned();
    const second = await commissioned(foreignProfile);
    completed(
      await first.invoke(
        'fleet.register',
        {
          ...first.helper.registration,
          availability: 'busy',
        },
        first.helper.token
      )
    );
    for (let index = 0; index < 5; index++)
      completed(
        await first.invoke(
          'work.request',
          first.request(),
          first.requester.token
        )
      );
    second.advance(1);
    const request = second.request();
    completed(
      await second.invoke('work.request', request, second.requester.token)
    );
    const dispatch = (id: string) =>
      id === profileId ? first.dispatcher : second.dispatcher;
    const deps = {
      ...first.http(),
      profiles: async () => [profileId, foreignProfile],
      dispatcher: {
        pendingSummerEvents: (id: string) =>
          dispatch(id).pendingSummerEvents(id),
        processSummerEvent: (
          id: string,
          eventId: string,
          validate: (input: unknown) => Promise<boolean>
        ) => dispatch(id).processSummerEvent(id, eventId, validate),
      },
    };
    await handleSummerFleetEvents(
      first.incoming({ operation: 'reconcile' }),
      deps
    );
    expect(
      (await second.dispatcher.inspect(foreignProfile)).missions
    ).toHaveLength(0);
    await handleSummerFleetEvents(
      first.incoming({ operation: 'reconcile' }),
      deps
    );
    expect(
      (await second.dispatcher.inspect(foreignProfile)).missions[0].missionId
    ).toBe(request.requestId);
  });

  it('persists provider attempts and continues repairing later eligible events', async () => {
    const f = await commissioned();
    const first = f.request();
    completed(await f.invoke('work.request', first, f.requester.token));
    f.advance(1);
    const second = f.request();
    completed(await f.invoke('work.request', second, f.requester.token));
    f.validateMission.mockRejectedValueOnce(
      new Error('bounded Linear timeout')
    );
    const response = await handleSummerFleetEvents(
      f.incoming({ operation: 'reconcile' }),
      f.http()
    );
    expect(response.status).toBe(200);
    expect((await response.json()).results[0]).toMatchObject({
      eventId: first.requestId,
      status: 'unavailable',
    });
    expect((await f.dispatcher.inspect(profileId)).missions[0].missionId).toBe(
      second.requestId
    );
    expect((await f.restart().pendingSummerEvents(profileId))[0]).toMatchObject(
      {
        eventId: first.requestId,
        lastAttemptAt: expect.any(String),
      }
    );
    expect(f.validateMission).toHaveBeenCalledTimes(2);
  });

  it('reconciles fairly beyond five blocked events without starving later eligible work', async () => {
    const f = await commissioned();
    const other = await f.agent('requester-two');
    await f.agent('helper-two');
    await f.control(
      'delegate',
      f.delegation({
        workerIds: ['requester', 'requester-two', 'helper', 'helper-two'],
      })
    );
    completed(
      await f.invoke(
        'fleet.register',
        { ...f.helper.registration, availability: 'busy' },
        f.helper.token
      )
    );
    for (let index = 0; index < 5; index++)
      completed(await f.invoke('work.request', f.request(), f.requester.token));
    f.advance(1);
    const eligible = f.request({ targetWorkerId: 'helper-two' });
    completed(await f.invoke('work.request', eligible, other.token));
    expect(
      (await f.dispatcher.pendingSummerEvents(profileId)).some(
        event => event.eventId === eligible.requestId
      )
    ).toBe(false);
    const first = await handleSummerFleetEvents(
      f.incoming({ operation: 'reconcile' }),
      f.http()
    );
    expect(first.status).toBe(200);
    expect((await f.dispatcher.inspect(profileId)).missions).toEqual([]);
    expect((await f.dispatcher.pendingSummerEvents(profileId))[0].eventId).toBe(
      eligible.requestId
    );
    const second = await handleSummerFleetEvents(
      f.incoming({ operation: 'reconcile' }),
      f.http()
    );
    expect(second.status).toBe(200);
    expect((await f.dispatcher.inspect(profileId)).missions).toMatchObject([
      { missionId: eligible.requestId },
    ]);
  });
  it('persists the wake with the request and admits only the delegated canonical mission, once across concurrent delivery', async () => {
    const f = await commissioned();
    const input = f.request();
    completed(await f.invoke('work.request', input, f.requester.token));
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toMatchObject([
      { eventId: input.requestId, state: 'pending' },
    ]);
    const responses = await Promise.all([
      f.process(input.requestId),
      f.process(input.requestId),
    ]);
    const bodies = await Promise.all(
      responses.map(response => response.json())
    );
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toMatchObject({
      ok: true,
      result: {
        status: 'completed',
        receipt: {
          authority: 'delegated-summer',
          principal: 'company.summer',
          outcome: 'accepted',
          profileId,
          requestId: input.requestId,
          missionId: input.requestId,
          founderIntentRef: 'urn:founder:fleet-canary',
        },
      },
    });
    const state = await f.dispatcher.inspect(profileId);
    expect(state.missions).toHaveLength(1);
    expect(state.summer?.delegation?.admissions).toBe(1);
    const { lease } = completed(
      await f.invoke('work.next', {}, f.helper.token)
    );
    expect(lease).toMatchObject({
      mission: {
        missionId: input.requestId,
        targetWorkerId: 'helper',
        owner: 'Summer',
      },
    });
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toEqual([]);
    expect(f.validateMission).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: input.requestId })
    );
  });

  it('recovers a lost wake after restart from the same durable state without a new request or founder impersonation', async () => {
    const f = await commissioned();
    const input = f.request();
    const scheduleSummerWake = vi.fn(() => {
      throw new Error('delivery unavailable');
    });
    const response = await handleFleetInvocation(
      new Request('https://jov.ie/api/v1/actions/work.request/invoke', {
        method: 'POST',
        headers: { authorization: `Bearer ${f.requester.token}` },
        body: JSON.stringify(f.envelope(input)),
      }),
      'work.request',
      {
        dispatcher: f.dispatcher,
        founder: async () => null,
        scheduleSummerWake,
      }
    );
    expect(response.status).toBe(200);
    expect(scheduleSummerWake).toHaveBeenCalledWith(profileId);
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toHaveLength(1);
    const recovered = await handleSummerFleetEvents(
      f.incoming({ operation: 'reconcile' }),
      f.http(f.restart())
    );
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({
      ok: true,
      results: [{ receipt: { outcome: 'accepted' } }],
    });
    expect((await f.dispatcher.inspect(profileId)).requests).toHaveLength(1);
    expect((await f.dispatcher.inspect(profileId)).missions).toHaveLength(1);
  });

  it('requires exact Summer authentication, server-owned profile binding and ID-only payloads before reading work', async () => {
    const f = await commissioned();
    const input = f.request();
    completed(await f.invoke('work.request', input, f.requester.token));
    for (const authorization of [
      '',
      `Bearer ${f.requester.token}`,
      'Bearer foreign-production-oidc',
    ]) {
      const response = await handleSummerFleetEvents(
        f.incoming(
          { operation: 'process', profileId, eventId: input.requestId },
          { authorization }
        ),
        f.http()
      );
      expect(response.status).toBe(401);
    }
    expect(f.profiles).not.toHaveBeenCalled();
    expect(
      (
        await handleSummerFleetEvents(
          f.incoming({
            operation: 'process',
            profileId: foreignProfile,
            eventId: input.requestId,
          }),
          f.http()
        )
      ).status
    ).toBe(403);
    expect(
      (
        await handleSummerFleetEvents(
          f.incoming({
            operation: 'process',
            profileId,
            eventId: input.requestId,
            command: 'grant-admin',
            callback: 'https://attacker.test',
          }),
          f.http()
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleSummerFleetEvents(
          f.incoming({ operation: 'reconcile', profileId: foreignProfile }),
          f.http()
        )
      ).status
    ).toBe(400);
    expect(f.validateMission).not.toHaveBeenCalled();
  });

  it('does not wake for customer Instinct, ungranted issues, disallowed work, or absent delegation', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    await f.agent('helper');
    const instinct = await f.agent('instinct', 'customer');
    await expect(
      f.control('delegate', f.delegation({ workerIds: ['instinct', 'helper'] }))
    ).rejects.toThrow('FORBIDDEN');
    const ungranted = f.request();
    completed(await f.invoke('work.request', ungranted, requester.token));
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toEqual([]);
    await f.control('delegate', f.delegation());
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toHaveLength(1);
    const customerRequest = f.request();
    completed(await f.invoke('work.request', customerRequest, instinct.token));
    completed(
      await f.invoke(
        'work.request',
        f.request({ issueId: 'JOV-9999' }),
        requester.token
      )
    );
    expect(
      (await f.dispatcher.pendingSummerEvents(profileId)).map(
        event => event.eventId
      )
    ).toEqual([ungranted.requestId]);
    await expect(
      f.control('delegate', { ...f.delegation(), spendUsd: 1 })
    ).rejects.toThrow();
    await expect(
      f.control('delegate', { ...f.delegation(), principal: 'instinct' })
    ).rejects.toThrow();
  });

  it('rechecks revocation and expiry after canonical verification before committing a mission', async () => {
    for (const change of ['revoke', 'expire', 'worker-revoke'] as const) {
      const f = await commissioned();
      const input = f.request();
      completed(await f.invoke('work.request', input, f.requester.token));
      f.validateMission.mockImplementation(async () => {
        if (change === 'revoke') await f.control('undelegate', {});
        else if (change === 'worker-revoke')
          await f.control('revoke', { workerId: 'helper' });
        else f.advance(3600001);
        return true;
      });
      const response = await f.process(input.requestId);
      expect([200, 409]).toContain(response.status);
      expect((await f.dispatcher.inspect(profileId)).missions).toEqual([]);
      expect((await f.process(input.requestId)).status).toBe(200);
      expect((await f.dispatcher.inspect(profileId)).missions).toEqual([]);
    }
  });

  it('retains blocked events for recovery and records canonical rejection separately from authority', async () => {
    const f = await commissioned();
    const input = f.request();
    completed(await f.invoke('work.request', input, f.requester.token));
    completed(
      await f.invoke(
        'fleet.register',
        { ...f.helper.registration, availability: 'busy' },
        f.helper.token
      )
    );
    expect(await (await f.process(input.requestId)).json()).toMatchObject({
      result: { status: 'blocked', reason: 'worker-unavailable' },
    });
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toHaveLength(1);
    completed(
      await f.invoke('fleet.register', f.helper.registration, f.helper.token)
    );
    f.validateMission.mockResolvedValue(false);
    expect(await (await f.process(input.requestId)).json()).toMatchObject({
      result: {
        receipt: {
          authority: 'delegated-summer',
          outcome: 'rejected',
          reason: 'canonical-work-invalid',
        },
      },
    });
    expect((await f.dispatcher.inspect(profileId)).missions).toEqual([]);
    expect(await f.dispatcher.pendingSummerEvents(profileId)).toEqual([]);
  });

  it('binds delegation to exact founder approval and preserves canceled-event audit on redelegation', async () => {
    const f = await commissioned();
    const input = f.request();
    completed(await f.invoke('work.request', input, f.requester.token));
    const body = { profileId, operation: 'delegate', input: f.delegation() };
    const request = () =>
      new Request('https://jov.ie/api/v1/fleet/approve', {
        method: 'POST',
        headers: { origin: 'https://jov.ie' },
        body: JSON.stringify(body),
      });
    expect(
      (
        await handleFleetControl(request(), 'approve', {
          dispatcher: f.dispatcher,
          founder: async () => 'other-admin',
          summerFounder: actor => actor === 'founder',
        })
      ).status
    ).toBe(403);
    const approve = await handleFleetControl(request(), 'approve', {
      dispatcher: f.dispatcher,
      founder: async () => 'founder',
      summerFounder: actor => actor === 'founder',
    });
    expect(approve.status).toBe(200);
    const { approvalId } = (await approve.json()) as { approvalId: string };
    await expect(
      f.dispatcher.control(
        profileId,
        'founder',
        approvalId,
        'delegate',
        f.delegation({ maxAdmissions: 200 })
      )
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    await f.control('undelegate', {});
    const receipt = (await f.dispatcher.inspect(profileId)).summer?.events[
      input.requestId
    ].receipt;
    await f.control('delegate', f.delegation());
    expect(
      (await f.dispatcher.inspect(profileId)).summer?.events[input.requestId]
        .receipt
    ).toEqual(receipt);
    expect(receipt).toMatchObject({
      outcome: 'canceled',
      reason: 'delegation-revoked',
    });
  });
});
