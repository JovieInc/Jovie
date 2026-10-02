import { randomUUID } from 'node:crypto';
import {
  actionResultSchema,
  FLEET_SCOPES,
  type FleetActionId,
  getActionDescriptor,
} from '@jovie/action-contracts';
import { describe, expect, it } from 'vitest';
import {
  type FleetBackend,
  type FleetControlOperation,
  FleetDispatcher,
} from './dispatcher';
import { handleFleetControl, handleFleetInvocation } from './http';

const profile = '11111111-1111-4111-a111-111111111111';
class Store implements FleetBackend {
  records = new Map<string, unknown>();
  async get(key: string) {
    return structuredClone(this.records.get(key) ?? null);
  }
  async setIfAbsent(key: string, value: unknown) {
    if (this.records.has(key)) return false;
    this.records.set(key, structuredClone(value));
    return true;
  }
  async compareAndSet(key: string, before: unknown, after: unknown) {
    if (JSON.stringify(before) !== JSON.stringify(this.records.get(key)))
      return false;
    this.records.set(key, structuredClone(after));
    return true;
  }
}
function fixture() {
  let now = Date.parse('2026-10-01T18:00:00Z');
  const store = new Store();
  const dispatcher = new FleetDispatcher({
    backend: store,
    enabled: true,
    now: () => now,
  });
  const control = async (
    operation: FleetControlOperation,
    input: unknown,
    id = profile
  ) =>
    dispatcher.control(
      id,
      'founder',
      await dispatcher.approve(id, 'founder', operation, input),
      operation,
      input
    );
  const authority = (worker: string, overrides = {}) => ({
    identity: {
      provider: 'codex',
      accountRef: `urn:account:${worker}`,
      runtimeRef: `urn:runtime:${worker}`,
      displayName: 'Same display name',
      role: 'operator',
      attestationRef: 'urn:approval:fixture',
    },
    visibility: 'operators',
    allowedCommands: ['api.openapi'],
    allowedTools: ['jovie'],
    allowedConnectors: [],
    maxDurationSeconds: 60,
    maxConcurrentLeases: 1,
    spendUsd: 0,
    ...overrides,
  });
  const register = (worker: string) => ({
    workerId: worker,
    runtimeClass: 'node24',
    capabilities: ['api.openapi'],
    tools: ['jovie'],
    connectors: [],
    availability: 'available',
  });
  const invoke = async (
    id: FleetActionId,
    input: unknown,
    token: string,
    key = randomUUID(),
    idProfile = profile
  ) => {
    const result = await dispatcher.invoke(
      id,
      {
        schemaVersion: 1,
        idempotencyKey: key,
        context: { profileId: idProfile, channel: 'cli' },
        input,
      },
      token
    );
    expect(
      actionResultSchema(getActionDescriptor(id).outputSchema).safeParse(result)
        .success
    ).toBe(true);
    return result;
  };
  const provision = async (
    worker: string,
    identity: unknown = authority(worker),
    scopes: readonly string[] = FLEET_SCOPES,
    id = profile
  ) =>
    (
      await control(
        'provision',
        {
          workerId: worker,
          scopes,
          expiresAt: new Date(now + 3600000).toISOString(),
          ...(identity ? { authority: identity } : {}),
        },
        id
      )
    ).token as string;
  const agent = async (
    worker: string,
    identity: unknown = authority(worker),
    scopes: readonly string[] = FLEET_SCOPES
  ) => {
    const token = await provision(worker, identity, scopes);
    expect(
      (await invoke('fleet.register', register(worker), token)).status
    ).toBe('completed');
    return token;
  };
  const request = (overrides = {}) => ({
    requestId: randomUUID(),
    kind: 'dogfood',
    proposal: {
      issueId: 'JOV-7393',
      title: 'Help verify public API',
      acceptanceCriteria: ['Valid public contract'],
      existingWorkRefs: ['urn:public:contract'],
      command: 'api.openapi',
      requiredTools: ['jovie'],
      requiredConnectors: [],
      targetWorkerId: 'helper',
      maxDurationSeconds: 60,
      notAfter: new Date(now + 300000).toISOString(),
      ...overrides,
    },
  });
  const accept = (requestId: string) =>
    control('accept', {
      requestId,
      owner: 'Tim White',
      founderIntentRef: 'urn:approval:public-contract',
    });
  return {
    dispatcher,
    store,
    authority,
    register,
    invoke,
    provision,
    agent,
    request,
    accept,
    control,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function data(result: Awaited<ReturnType<FleetDispatcher['invoke']>>) {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error('Expected completion');
  return result.data;
}
function denied(
  result: Awaited<ReturnType<FleetDispatcher['invoke']>>,
  code: string
) {
  expect(result).toMatchObject({ status: 'unavailable', error: { code } });
}

describe('bounded coordination in the existing fleet', () => {
  it('distinguishes account/runtime bindings from display names, and hides operator-only peers from customers', async () => {
    const f = fixture();
    const operator = await f.agent('operator');
    const customerAuthority = f.authority('customer', { visibility: 'fleet' });
    customerAuthority.identity.role = 'customer';
    const customer = await f.agent('customer', customerAuthority);
    const peers = data(await f.invoke('fleet.directory', {}, operator))
      .workers as {
      workerId: string;
      authority: { identity: { accountRef: string } };
    }[];
    expect(peers.map(p => p.authority.identity.accountRef)).toEqual([
      'urn:account:operator',
      'urn:account:customer',
    ]);
    expect(
      (
        data(await f.invoke('fleet.directory', {}, customer)).workers as {
          workerId: string;
        }[]
      ).map(p => p.workerId)
    ).toEqual(['customer']);
    denied(
      await f.invoke(
        'work.request',
        f.request({ targetWorkerId: 'operator' }),
        customer
      ),
      'FORBIDDEN'
    );
    await expect(
      f.provision('duplicate', f.authority('operator'))
    ).rejects.toThrow('CONFLICT');
  });
  it('requires attested identity and separate discovery/request scopes, and rejects worker capability overclaims', async () => {
    const f = fixture();
    const legacy = await f.agent('legacy', null);
    denied(await f.invoke('fleet.directory', {}, legacy), 'REQUIRES_INPUT');
    denied(
      await f.invoke('work.request', f.request(), legacy),
      'REQUIRES_INPUT'
    );
    const limited = await f.agent('limited', f.authority('limited'), [
      'fleet:register',
      'fleet:read',
    ]);
    denied(await f.invoke('fleet.directory', {}, limited), 'FORBIDDEN');
    denied(await f.invoke('work.request', f.request(), limited), 'FORBIDDEN');
    denied(
      await f.invoke(
        'fleet.register',
        { ...f.register('limited'), capabilities: ['artist.get'] },
        limited
      ),
      'FORBIDDEN'
    );
    denied(
      await f.invoke(
        'fleet.register',
        { ...f.register('limited'), authority: f.authority('limited') },
        limited
      ),
      'VALIDATION_FAILED'
    );
  });
  it('refreshes discovery under the same key after peer revocation or stale heartbeat, without exposing another profile', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    await f.agent('helper');
    const key = randomUUID();
    expect(
      data(await f.invoke('fleet.directory', {}, requester, key)).workers
    ).toHaveLength(2);
    await f.control('revoke', { workerId: 'helper' });
    expect(
      data(await f.invoke('fleet.directory', {}, requester, key)).workers
    ).toHaveLength(1);
    denied(
      await f.invoke(
        'fleet.directory',
        {},
        requester,
        randomUUID(),
        '22222222-2222-4222-a222-222222222222'
      ),
      'AUTH_REQUIRED'
    );
    f.advance(300001);
    expect(
      data(await f.invoke('fleet.directory', {}, requester, key)).workers
    ).toEqual([]);
  });
  it('deduplicates concurrent requests but never grants work before exact approval; routes the terminal receipt back', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    const helper = await f.agent('helper');
    const input = f.request();
    const results = await Promise.all([
      f.invoke('work.request', input, requester),
      f.invoke('work.request', input, requester),
    ]);
    expect(results.map(r => data(r).request)).toEqual([
      data(results[0]).request,
      data(results[0]).request,
    ]);
    expect((await f.dispatcher.inspect(profile)).requests).toHaveLength(1);
    expect(data(await f.invoke('work.next', {}, helper)).lease).toBeNull();
    await expect(
      f.dispatcher.control(profile, 'founder', randomUUID(), 'accept', {
        requestId: input.requestId,
        owner: 'Tim White',
        founderIntentRef: 'urn:approval:public-contract',
      })
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    await f.accept(input.requestId);
    const lease = data(await f.invoke('work.next', {}, helper)).lease as {
      leaseId: string;
    };
    await f.invoke('work.claim', { leaseId: lease.leaseId }, helper);
    const report = {
      leaseId: lease.leaseId,
      outcome: 'completed',
      summary: 'Public API is valid',
      evidence: [
        { ref: 'https://jov.ie/api/v1/openapi.json', summary: 'Public read' },
      ],
    };
    const terminal = data(
      await f.invoke('work.report', report, helper)
    ).receipt;
    const routed = (
      data(await f.invoke('fleet.status', {}, requester)).requests as {
        state: string;
        receipt: unknown;
      }[]
    )[0];
    expect(routed).toMatchObject({ state: 'completed', receipt: terminal });
    expect((await f.dispatcher.inspect(profile)).receipts).toHaveLength(1);
  });
  it('rejects changed request payload, private/credential references, excessive duration and unsupported work', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    await f.agent('helper');
    const input = f.request();
    data(await f.invoke('work.request', input, requester));
    denied(
      await f.invoke('work.request', { ...input, kind: 'research' }, requester),
      'CONFLICT'
    );
    denied(
      await f.invoke(
        'work.request',
        f.request({ maxDurationSeconds: 90 }),
        requester
      ),
      'FORBIDDEN'
    );
    denied(
      await f.invoke(
        'work.request',
        f.request({
          existingWorkRefs: ['https://example.com/private?token=abc'],
        }),
        requester
      ),
      'VALIDATION_FAILED'
    );
    denied(
      await f.invoke(
        'work.request',
        f.request({ title: 'Bearer private-token' }),
        requester
      ),
      'VALIDATION_FAILED'
    );
    denied(
      await f.invoke(
        'work.request',
        f.request({ command: 'release.create' }),
        requester
      ),
      'VALIDATION_FAILED'
    );
    denied(
      await f.invoke(
        'work.request',
        f.request({ founderIntentRef: 'urn:approval:forged' }),
        requester
      ),
      'VALIDATION_FAILED'
    );
    await expect(
      f.provision('spender', f.authority('spender', { spendUsd: 1 }))
    ).rejects.toThrow();
  });
  it('bounds pending work, routes rejection/expiry and refuses approval against stale or revoked recipients', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    await f.agent('helper');
    const inputs = Array.from({ length: 5 }, () => f.request());
    for (const input of inputs)
      data(await f.invoke('work.request', input, requester));
    denied(
      await f.invoke('work.request', f.request(), requester),
      'QUOTA_EXHAUSTED'
    );
    await f.control('reject', {
      requestId: inputs[0].requestId,
      reason: 'capacity',
    });
    expect(
      (
        data(await f.invoke('fleet.status', {}, requester)).requests as {
          requestId: string;
          state: string;
          reason?: string;
        }[]
      ).find(r => r.requestId === inputs[0].requestId)
    ).toMatchObject({ state: 'rejected', reason: 'capacity' });
    f.advance(300001);
    await expect(f.accept(inputs[1].requestId)).rejects.toThrow('CONFLICT');
    expect(
      (
        data(await f.invoke('fleet.status', {}, requester)).requests as {
          requestId: string;
          state: string;
        }[]
      ).find(r => r.requestId === inputs[1].requestId)?.state
    ).toBe('expired');
  });
  it('keeps temporary helper unavailability inside the pending quota until rejection or expiry', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    const helper = await f.agent('helper');
    const inputs = Array.from({ length: 5 }, () =>
      f.request({
        notAfter: '2026-10-01T18:10:00Z',
      })
    );
    for (const input of inputs)
      data(await f.invoke('work.request', input, requester));
    f.advance(300001);
    expect(
      (
        data(await f.invoke('fleet.status', {}, requester)).requests as {
          state: string;
        }[]
      ).every(r => r.state === 'unavailable')
    ).toBe(true);
    denied(
      await f.invoke('work.request', f.request(), requester),
      'QUOTA_EXHAUSTED'
    );
    await f.invoke('fleet.register', f.register('helper'), helper);
    expect(
      (
        data(await f.invoke('fleet.status', {}, requester)).requests as {
          state: string;
        }[]
      ).filter(r => r.state === 'pending')
    ).toHaveLength(5);
    await f.control('reject', {
      requestId: inputs[0].requestId,
      reason: 'declined',
    });
    data(await f.invoke('work.request', f.request(), requester));
    denied(
      await f.invoke('work.request', f.request(), requester),
      'QUOTA_EXHAUSTED'
    );
  });
  it('reserves mission and request IDs in both directions and never attaches an unrelated receipt', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    const helper = await f.agent('helper');
    const input = f.request();
    const mission = {
      ...input.proposal,
      missionId: input.requestId,
      owner: 'Tim White',
      founderIntentRef: 'urn:approval:assigned',
    };
    await f.control('assign', mission);
    denied(await f.invoke('work.request', input, requester), 'CONFLICT');
    const lease = data(await f.invoke('work.next', {}, helper)).lease as {
      leaseId: string;
    };
    await f.invoke('work.claim', { leaseId: lease.leaseId }, helper);
    await f.invoke(
      'work.report',
      {
        leaseId: lease.leaseId,
        outcome: 'completed',
        summary: 'Assigned mission finished',
        evidence: [{ ref: 'urn:public:result', summary: 'Assigned receipt' }],
      },
      helper
    );
    denied(await f.invoke('work.request', input, requester), 'CONFLICT');
    expect(
      data(await f.invoke('fleet.status', {}, requester)).requests
    ).toEqual([]);
    const pending = f.request();
    data(await f.invoke('work.request', pending, requester));
    await expect(
      f.control('assign', {
        ...mission,
        missionId: pending.requestId,
        title: 'Unrelated assignment',
      })
    ).rejects.toThrow('CONFLICT');
    expect(
      (
        data(await f.invoke('fleet.status', {}, requester)).requests as {
          state: string;
        }[]
      )[0].state
    ).toBe('pending');
  });
  it('requires currently registered tools and connectors before approving a compatible helper', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    const helper = await f.agent('helper');
    await f.invoke(
      'fleet.register',
      { ...f.register('helper'), tools: [] },
      helper
    );
    const input = f.request();
    await f.invoke('work.request', input, requester);
    await expect(f.accept(input.requestId)).rejects.toThrow('CONFLICT');
    expect((await f.dispatcher.inspect(profile)).missions).toEqual([]);
    await f.invoke('fleet.register', f.register('helper'), helper);
    await f.accept(input.requestId);
    expect(data(await f.invoke('work.next', {}, helper)).lease).not.toBeNull();
  });
  it('routes recipient revocation to the requester and keeps approval inputs/worker bearers isolated', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    const helper = await f.agent('helper');
    const input = f.request();
    await f.invoke('work.request', input, requester);
    const admission = {
      requestId: input.requestId,
      owner: 'Tim White',
      founderIntentRef: 'urn:approval:public-contract',
    };
    const approval = await f.dispatcher.approve(
      profile,
      'founder',
      'accept',
      admission
    );
    await expect(
      f.dispatcher.control(profile, 'founder', approval, 'accept', {
        ...admission,
        owner: 'Other owner',
      })
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    const deps = {
      dispatcher: f.dispatcher,
      founder: async () => 'founder',
      validateMission: async () => true,
    };
    const request = new Request('https://local.test/api/control', {
      method: 'POST',
      headers: {
        origin: 'https://local.test',
        authorization: `Bearer ${requester}`,
      },
      body: JSON.stringify({
        profileId: profile,
        operation: 'accept',
        input: admission,
      }),
    });
    expect((await handleFleetControl(request, 'approve', deps)).status).toBe(
      403
    );
    await f.accept(input.requestId);
    await f.invoke('work.next', {}, helper);
    await f.control('revoke', { workerId: 'helper' });
    expect(
      (
        data(await f.invoke('fleet.status', {}, requester)).requests as {
          state: string;
        }[]
      )[0].state
    ).toBe('unavailable');
    denied(await f.invoke('fleet.status', {}, helper), 'AUTH_REQUIRED');
  });
  it('requires canonical Linear mission validation on the existing founder HTTP acceptance route', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    await f.agent('helper');
    const input = f.request();
    await f.invoke('work.request', input, requester);
    const value = {
      profileId: profile,
      operation: 'accept',
      input: {
        requestId: input.requestId,
        owner: 'Tim White',
        founderIntentRef: 'urn:approval:public-contract',
      },
    };
    const make = () =>
      new Request('https://local.test/api/control', {
        method: 'POST',
        headers: { origin: 'https://local.test' },
        body: JSON.stringify(value),
      });
    const deps = {
      dispatcher: f.dispatcher,
      founder: async () => 'founder',
      validateMission: async () => false,
    };
    expect((await handleFleetControl(make(), 'approve', deps)).status).toBe(
      409
    );
    expect((await f.dispatcher.inspect(profile)).missions).toEqual([]);
    const response = await handleFleetControl(make(), 'approve', {
      ...deps,
      validateMission: async mission => {
        expect(mission).toMatchObject({
          missionId: input.requestId,
          issueId: 'JOV-7393',
          owner: 'Tim White',
        });
        return true;
      },
    });
    expect(response.status).toBe(200);
  });
  it('uses the canonical scoped REST request route without disclosing pending work to another worker', async () => {
    const f = fixture();
    const requester = await f.agent('requester');
    const helper = await f.agent('helper');
    const input = f.request();
    const response = await handleFleetInvocation(
      new Request('https://local.test/api/v1/actions/work.request/invoke', {
        method: 'POST',
        headers: { authorization: `Bearer ${requester}` },
        body: JSON.stringify({
          schemaVersion: 1,
          idempotencyKey: randomUUID(),
          context: { profileId: profile, channel: 'cli' },
          input,
        }),
      }),
      'work.request',
      { dispatcher: f.dispatcher, founder: async () => null }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'completed',
      data: { request: { requesterWorkerId: 'requester', state: 'pending' } },
    });
    expect(data(await f.invoke('fleet.status', {}, helper)).requests).toEqual(
      []
    );
    expect(
      data(await f.invoke('fleet.status', {}, requester)).requests as unknown[]
    ).toHaveLength(1);
  });
});
