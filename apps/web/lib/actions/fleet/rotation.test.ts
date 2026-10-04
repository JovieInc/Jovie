import { randomUUID } from 'node:crypto';
import { FLEET_SCOPES, type FleetActionId } from '@jovie/action-contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  type FleetBackend,
  type FleetControlOperation,
  FleetDispatcher,
  type FleetLinear,
  type FleetResult,
} from './dispatcher';
import { handleFleetControl } from './http';

const profileId = '11111111-1111-4111-a111-111111111111';
const otherProfile = '22222222-2222-4222-a222-222222222222';
const authority = {
  identity: {
    provider: 'codex',
    accountRef: 'urn:account:summer',
    runtimeRef: 'urn:runtime:summer',
    displayName: 'Summer',
    role: 'operator',
    attestationRef: 'urn:founder:summer-attestation',
  },
  visibility: 'operators',
  allowedCommands: ['api.openapi', 'docs.llms'],
  allowedTools: ['jovie'],
  allowedConnectors: [],
  maxDurationSeconds: 60,
  maxConcurrentLeases: 1,
  spendUsd: 0,
};
const registration = {
  workerId: 'summer',
  runtimeClass: 'codex',
  capabilities: ['api.openapi', 'docs.llms'],
  tools: ['jovie'],
  connectors: [],
  availability: 'available',
};
function fixture(linear?: FleetLinear) {
  let now = Date.parse('2026-10-02T12:00:00Z');
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
  const dispatcher = new FleetDispatcher({
    backend,
    enabled: true,
    linear,
    now: () => now,
  });
  const control = async (operation: FleetControlOperation, input: unknown) =>
    dispatcher.control(
      profileId,
      'founder',
      await dispatcher.approve(profileId, 'founder', operation, input),
      operation,
      input
    );
  const credential = (overrides = {}) => ({
    workerId: 'summer',
    scopes: FLEET_SCOPES,
    expiresAt: new Date(now + 86400000).toISOString(),
    authority,
    ...overrides,
  });
  const invoke = (
    action: FleetActionId,
    input: unknown,
    token: string,
    idempotencyKey = randomUUID(),
    profile = profileId
  ) =>
    dispatcher.invoke(
      action,
      {
        schemaVersion: 1,
        idempotencyKey,
        context: { profileId: profile, channel: 'cli' },
        input,
      },
      token
    );
  const assign = () =>
    control('assign', {
      missionId: randomUUID(),
      issueId: 'JOV-7393',
      title: 'Read API contract',
      acceptanceCriteria: ['Read the public contract'],
      owner: 'Summer',
      existingWorkRefs: [],
      command: 'api.openapi',
      requiredTools: ['jovie'],
      requiredConnectors: [],
      targetWorkerId: 'summer',
      maxDurationSeconds: 60,
      notAfter: new Date(now + 3600000).toISOString(),
      founderIntentRef: 'urn:founder:api-canary',
    });
  const provision = async () => {
    const token = String((await control('provision', credential())).token);
    data(await invoke('fleet.register', registration, token));
    return token;
  };
  return {
    dispatcher,
    control,
    credential,
    invoke,
    assign,
    provision,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function data(result: FleetResult) {
  expect(result.status).toBe('completed');
  if (result.status !== 'completed') throw new Error('Expected completion');
  return result.data;
}
async function claim(f: ReturnType<typeof fixture>, token: string) {
  const { lease } = data(await f.invoke('work.next', {}, token));
  const leaseId = (lease as { leaseId: string }).leaseId;
  data(await f.invoke('work.claim', { leaseId }, token));
  return leaseId;
}
const evidence = [{ ref: 'urn:proof:contract', summary: 'Contract received' }];

describe('stable worker credential rotation', () => {
  it('preserves identity and receipt history while replacing a revoked credential under the same worker ID', async () => {
    const f = fixture();
    const oldToken = await f.provision();
    const before = (await f.dispatcher.inspect(profileId)).workers[0];
    await f.assign();
    const leaseId = await claim(f, oldToken);
    const report = { leaseId, outcome: 'completed', summary: 'Read', evidence };
    const reportKey = randomUUID();
    const receipt = data(
      await f.invoke('work.report', report, oldToken, reportKey)
    ).receipt;
    await f.control('revoke', { workerId: 'summer' });
    f.advance(1000);
    const { authority: _authority, ...input } = f.credential();
    const token = String((await f.control('rotate', input)).token);
    expect(token).not.toBe(oldToken);
    expect(token.split('.').slice(0, 3)).toEqual(
      oldToken.split('.').slice(0, 3)
    );
    expect(await f.invoke('fleet.status', {}, oldToken)).toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });
    expect(
      await f.invoke('fleet.status', {}, token, randomUUID(), otherProfile)
    ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    const status = data(await f.invoke('fleet.status', {}, token));
    expect(status.worker).toMatchObject({
      workerId: 'summer',
      registeredAt: before.registeredAt,
      authority,
      availability: 'offline',
      revoked: false,
      capabilities: [],
    });
    expect(status.receipts).toEqual([receipt]);
    expect(
      await f.invoke('work.report', report, token, reportKey)
    ).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    data(await f.invoke('fleet.register', registration, token));
    expect((await f.dispatcher.inspect(profileId)).workers).toHaveLength(1);
  });

  it('narrows scopes and authority without replaying previous registration, lease or report successes', async () => {
    const f = fixture();
    const oldToken = await f.provision();
    const registrationKey = randomUUID();
    data(
      await f.invoke('fleet.register', registration, oldToken, registrationKey)
    );
    await f.assign();
    const nextKey = randomUUID();
    const lease = data(await f.invoke('work.next', {}, oldToken, nextKey))
      .lease as {
      leaseId: string;
    };
    const claimKey = randomUUID();
    data(
      await f.invoke(
        'work.claim',
        { leaseId: lease.leaseId },
        oldToken,
        claimKey
      )
    );
    const token = String(
      (
        await f.control(
          'rotate',
          f.credential({
            authority: { ...authority, allowedCommands: ['docs.llms'] },
            scopes: FLEET_SCOPES.filter(scope => scope !== 'defect:report'),
          })
        )
      ).token
    );
    expect(
      await f.invoke('fleet.register', registration, token, registrationKey)
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    data(
      await f.invoke(
        'fleet.register',
        {
          ...registration,
          capabilities: ['docs.llms'],
        },
        token
      )
    );
    expect(
      data(await f.invoke('work.next', {}, token, nextKey)).lease
    ).toBeNull();
    expect(
      await f.invoke('work.claim', { leaseId: lease.leaseId }, token, claimKey)
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      await f.invoke(
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'completed',
          summary: 'Stale',
          evidence,
        },
        token
      )
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      await f.invoke(
        'defect.report',
        {
          leaseId: lease.leaseId,
          title: 'Failure',
          command: 'api.openapi',
          apiCode: 'FAILED',
          details: 'Failed',
          evidence,
        },
        token
      )
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect((await f.dispatcher.inspect(profileId)).leases[0].expiresAt).toBe(
      '2026-10-02T12:00:00.000Z'
    );
  });

  it('fences a suspended defect write and denies its reservation to the replacement credential', async () => {
    let entered: () => void = () => {};
    let release: (value: null) => void = () => {};
    const started = new Promise<void>(resolve => {
      entered = resolve;
    });
    const create = vi.fn();
    const append = vi.fn();
    const find = vi.fn(async () => {
      entered();
      return new Promise<null>(resolve => {
        release = resolve;
      });
    });
    const f = fixture({ find, create, append });
    const oldToken = await f.provision();
    await f.assign();
    const leaseId = await claim(f, oldToken);
    const input = {
      leaseId,
      title: 'Failure',
      command: 'api.openapi',
      apiCode: 'FAILED',
      details: 'Failed',
      evidence,
    };
    const key = randomUUID();
    const pending = f.invoke('defect.report', input, oldToken, key);
    await started;
    const token = String(
      (
        await f.control(
          'rotate',
          f.credential({
            authority: { ...authority, allowedCommands: ['docs.llms'] },
          })
        )
      ).token
    );
    release(null);
    expect(await pending).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    f.advance(30001);
    expect(await f.invoke('defect.report', input, token, key)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    expect(find).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('requires an existing stable identity and exact, single-use founder approval', async () => {
    const f = fixture();
    const input = f.credential();
    await expect(f.control('rotate', input)).rejects.toThrow('CONFLICT');
    await f.provision();
    const approval = await f.dispatcher.approve(
      profileId,
      'founder',
      'rotate',
      input
    );
    await expect(
      f.dispatcher.control(profileId, 'other', approval, 'rotate', input)
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    await expect(
      f.dispatcher.control(otherProfile, 'founder', approval, 'rotate', input)
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    await expect(
      f.dispatcher.control(profileId, 'founder', approval, 'rotate', {
        ...input,
        scopes: ['fleet:read'],
      })
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    await f.dispatcher.control(profileId, 'founder', approval, 'rotate', input);
    await expect(
      f.dispatcher.control(profileId, 'founder', approval, 'rotate', input)
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    for (const field of ['provider', 'accountRef', 'runtimeRef'] as const) {
      await expect(
        f.control(
          'rotate',
          f.credential({
            authority: {
              ...authority,
              identity: {
                ...authority.identity,
                [field]: field === 'provider' ? 'other' : 'urn:other:identity',
              },
            },
          })
        )
      ).rejects.toThrow('FORBIDDEN');
    }
    const expired = await f.dispatcher.approve(
      profileId,
      'founder',
      'rotate',
      input
    );
    f.advance(120001);
    await expect(
      f.dispatcher.control(profileId, 'founder', expired, 'rotate', input)
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
  });

  it('renews expired credentials and retains the issuance lifetime limit', async () => {
    const f = fixture();
    const oldToken = await f.provision();
    f.advance(86400001);
    expect(await f.invoke('fleet.status', {}, oldToken)).toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });
    for (const expiresAt of ['2026-10-02T12:00:00Z', '2027-10-02T12:00:00Z']) {
      await expect(
        f.control('rotate', f.credential({ expiresAt }))
      ).rejects.toThrow('VALIDATION_FAILED');
    }
    const token = String((await f.control('rotate', f.credential())).token);
    data(await f.invoke('fleet.register', registration, token));
  });

  it('exposes rotation only through same-origin founder control with profile ownership', async () => {
    const f = fixture();
    const token = await f.provision();
    const founder = vi.fn(async (_request: Request, profile: string) =>
      profile === profileId ? 'founder' : null
    );
    const deps = { dispatcher: f.dispatcher, founder };
    const input = f.credential();
    const body = { profileId, operation: 'rotate', input };
    const request = (payload: unknown, headers: Record<string, string> = {}) =>
      new Request('https://jov.ie/api/v1/fleet/approve', {
        method: 'POST',
        headers: { Origin: 'https://jov.ie', ...headers },
        body: JSON.stringify(payload),
      });
    const rejectedHeaders: Record<string, string>[] = [
      { Authorization: `Bearer ${token}` },
      { Origin: 'https://attacker.test' },
    ];
    for (const headers of rejectedHeaders) {
      expect(
        (await handleFleetControl(request(body, headers), 'approve', deps))
          .status
      ).toBe(403);
    }
    expect(founder).not.toHaveBeenCalled();
    expect(
      (
        await handleFleetControl(
          request({ ...body, profileId: otherProfile }),
          'approve',
          deps
        )
      ).status
    ).toBe(403);
    const approved = await handleFleetControl(request(body), 'approve', deps);
    expect(approved.status).toBe(200);
    const { approvalId } = (await approved.json()) as { approvalId: string };
    const executed = await handleFleetControl(
      request({ ...body, approvalId }),
      'execute',
      deps
    );
    expect(executed.status).toBe(200);
    expect(await executed.json()).toMatchObject({ workerId: 'summer' });
    expect(await f.invoke('fleet.status', {}, token)).toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });
  });
});
