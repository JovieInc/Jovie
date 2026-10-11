import { randomUUID } from 'node:crypto';
import { FLEET_SCOPES, type FleetActionId } from '@jovie/action-contracts';
import { describe, expect, it } from 'vitest';
import {
  type FleetBackend,
  FleetDispatcher,
  type FleetLinear,
  type Issue,
} from './dispatcher';

const profileId = '11111111-1111-4111-a111-111111111111';
class Memory implements FleetBackend {
  value: unknown = null;
  async get() {
    return structuredClone(this.value);
  }
  async setIfAbsent(_k: string, v: unknown) {
    if (this.value !== null) return false;
    this.value = structuredClone(v);
    return true;
  }
  async compareAndSet(_k: string, b: unknown, a: unknown) {
    if (JSON.stringify(b) !== JSON.stringify(this.value)) return false;
    this.value = structuredClone(a);
    return true;
  }
}
function fixture(linear?: FleetLinear, profile = profileId) {
  let now = Date.parse('2026-09-30T12:00:00Z');
  const backend = new Memory();
  const d = new FleetDispatcher({
    backend,
    enabled: true,
    linear,
    now: () => now,
  });
  const control = async (
    op: 'provision' | 'revoke' | 'assign',
    input: unknown
  ) =>
    d.control(
      profile,
      'founder',
      await d.approve(profile, 'founder', op, input),
      op,
      input
    );
  const provision = async (
    workerId: string,
    scopes: readonly string[] = FLEET_SCOPES
  ) =>
    (
      await control('provision', {
        workerId,
        scopes,
        expiresAt: new Date(now + 86400000).toISOString(),
      })
    ).token as string;
  const registration = (workerId = 'aeon') => ({
    workerId,
    runtimeClass: 'codex',
    capabilities: ['api.openapi'],
    tools: ['jovie'],
    connectors: [],
    availability: 'available',
  });
  const envelope = (
    input: unknown,
    key: string = randomUUID(),
    channel = 'cli'
  ) => ({
    schemaVersion: 1,
    idempotencyKey: key,
    context: { profileId: profile, channel, clientVersion: 'test' },
    input,
  });
  const invoke = (
    id: FleetActionId,
    input: unknown,
    token?: string,
    key?: string
  ) => d.invoke(id, envelope(input, key), token);
  const assign = (overrides = {}) =>
    control('assign', {
      missionId: randomUUID(),
      issueId: 'JOV-7331',
      title: 'Verify API contract',
      acceptanceCriteria: ['Valid OpenAPI returned'],
      owner: 'Tim White',
      existingWorkRefs: [],
      command: 'api.openapi',
      requiredTools: ['jovie'],
      requiredConnectors: [],
      maxDurationSeconds: 30,
      notAfter: new Date(now + 3600000).toISOString(),
      founderIntentRef: 'urn:approval:test',
      ...overrides,
    });
  return {
    d,
    backend,
    control,
    provision,
    registration,
    envelope,
    invoke,
    assign,
    advance: (ms: number) => (now += ms),
  };
}
function data(result: any) {
  expect(result.status).toBe('completed');
  return result.data;
}
const evidence = [
  { ref: 'urn:canary:openapi', summary: 'Valid contract retrieved' },
];
describe('bounded fleet authority', () => {
  it('rejects credential-shaped mission text without narrowing the boundary', async () => {
    const f = fixture();
    await expect(f.assign({ title: `sk-${'a'.repeat(16)}` })).rejects.toThrow(
      'VALIDATION_FAILED'
    );
    await expect(f.assign({ title: `SK-${'A'.repeat(16)}` })).rejects.toThrow(
      'VALIDATION_FAILED'
    );
    await expect(
      f.assign({ title: `sk-${'a'.repeat(15)}` })
    ).resolves.toBeDefined();
  });
  async function claimed(f: ReturnType<typeof fixture>, workerId = 'aeon') {
    const token = await f.provision(workerId);
    data(await f.invoke('fleet.register', f.registration(workerId), token));
    const lease = data(await f.invoke('work.next', {}, token)).lease;
    data(await f.invoke('work.claim', { leaseId: lease.leaseId }, token));
    return {
      token,
      input: {
        leaseId: lease.leaseId,
        title: 'API unavailable',
        command: 'api.openapi',
        apiCode: 'RATE_LIMITED',
        details: 'Read failed',
        evidence,
      },
    };
  }
  it('rechecks revocation after each awaited provider step before writes', async () => {
    for (const step of ['find', 'create'] as const) {
      let f: ReturnType<typeof fixture>,
        creates = 0,
        appends = 0;
      const linear: FleetLinear = {
        find: async () => {
          if (step === 'find') await f.control('revoke', { workerId: 'aeon' });
          return null;
        },
        create: async input => {
          creates++;
          if (step === 'create')
            await f.control('revoke', { workerId: 'aeon' });
          return {
            issueId: input.id,
            identifier: 'JOV-9999',
            url: 'https://linear.app/jovie/issue/JOV-9999',
            fingerprint: input.fingerprint,
          };
        },
        append: async () => {
          appends++;
        },
      };
      f = fixture(linear);
      await f.assign();
      const { token, input } = await claimed(f);
      expect(await f.invoke('defect.report', input, token)).toMatchObject({
        error: { code: 'AUTH_REQUIRED' },
      });
      expect(creates).toBe(step === 'find' ? 0 : 1);
      expect(appends).toBe(0);
    }
  });
  it('binds a pending invocation key before an ambiguous external commit', async () => {
    let creates = 0;
    const f = fixture({
      find: async () => null,
      create: async () => {
        creates++;
        throw new Error('ambiguous');
      },
      append: async () => {},
    });
    await f.assign({ maxDurationSeconds: 60 });
    const { token, input } = await claimed(f);
    const key = randomUUID();
    expect(await f.invoke('defect.report', input, token, key)).toMatchObject({
      status: 'unavailable',
    });
    expect(
      await f.invoke(
        'defect.report',
        { ...input, title: 'Different defect' },
        token,
        key
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(creates).toBe(1);
  });
  it('settles expired missing-provider recovery instead of leaving an infinite reservation', async () => {
    let creates = 0;
    const f = fixture({
      find: async () => null,
      create: async () => {
        creates++;
        throw new Error('ambiguous');
      },
      append: async () => {
        throw new Error('unexpected append');
      },
    });
    await f.assign();
    const { token, input } = await claimed(f);
    const key = randomUUID();
    await f.invoke('defect.report', input, token, key);
    f.advance(30001);
    const settled = await f.invoke('defect.report', input, token, key);
    expect(settled).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(await f.invoke('defect.report', input, token, key)).toEqual(settled);
    expect(creates).toBe(1);
  });
  it('fences a late provider read after a replacement takes ownership', async () => {
    let resolveRead: (value: null) => void = () => {},
      started: () => void = () => {};
    const entered = new Promise<void>(resolve => {
      started = resolve;
    });
    let finds = 0,
      creates = 0;
    const f = fixture({
      find: async () => {
        if (++finds === 1) {
          started();
          return new Promise<null>(resolve => {
            resolveRead = resolve;
          });
        }
        return null;
      },
      create: async input => {
        creates++;
        return {
          issueId: input.id,
          identifier: 'JOV-9999',
          url: 'https://linear.app/jovie/issue/JOV-9999',
          fingerprint: input.fingerprint,
        };
      },
      append: async () => {},
    });
    await f.assign();
    const first = await claimed(f);
    const original = f.invoke('defect.report', first.input, first.token);
    await entered;
    f.advance(30001);
    const second = await claimed(f, 'other');
    data(await f.invoke('defect.report', second.input, second.token));
    resolveRead(null);
    expect(await original).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(creates).toBe(1);
  });
  it('reconciles an expired originating lease without new external writes', async () => {
    let issue: Issue | null = null,
      creates = 0,
      appends = 0;
    let createdBody = '';
    const f = fixture({
      find: async () => issue,
      create: async input => {
        creates++;
        createdBody = input.description;
        issue = {
          issueId: input.id,
          identifier: 'JOV-9999',
          url: 'https://linear.app/jovie/issue/JOV-9999',
          fingerprint: input.fingerprint,
        };
        throw new Error('ambiguous');
      },
      append: async () => {
        appends++;
      },
      verifyEvidence: async input => input.body === createdBody,
    });
    await f.assign();
    const { token, input } = await claimed(f);
    const key = randomUUID();
    expect(await f.invoke('defect.report', input, token, key)).toMatchObject({
      status: 'unavailable',
    });
    f.advance(30001);
    data(await f.invoke('defect.report', input, token, key));
    expect(creates).toBe(1);
    expect(appends).toBe(0);
  });
  it('does not acknowledge new evidence that failed to append to an existing defect', async () => {
    let issue: Issue | null = null,
      createdBody = '',
      appendCalls = 0;
    const comments = new Map<string, string>();
    const f = fixture({
      find: async () => issue,
      create: async input => {
        createdBody = input.description;
        return (issue = {
          issueId: input.id,
          identifier: 'JOV-9999',
          url: 'https://linear.app/jovie/issue/JOV-9999',
          fingerprint: input.fingerprint,
        });
      },
      append: async input => {
        if (++appendCalls === 2) throw new Error('before commit');
        comments.set(input.id, input.body);
      },
      verifyEvidence: async input =>
        comments.get(input.id) === input.body || createdBody === input.body,
    });
    await f.assign();
    const { token, input } = await claimed(f);
    data(await f.invoke('defect.report', input, token));
    const second = {
      ...input,
      details: 'New unpersisted evidence',
      evidence: [{ ref: 'urn:canary:new-proof', summary: 'New proof' }],
    };
    const key = randomUUID();
    expect(await f.invoke('defect.report', second, token, key)).toMatchObject({
      status: 'unavailable',
    });
    f.advance(30001);
    expect(await f.invoke('defect.report', second, token, key)).toMatchObject({
      error: { code: 'CONFLICT' },
    });
    expect(appendCalls).toBe(2);
  });
  it('namespaces deterministic evidence IDs by profile for identical worker and invocation keys', async () => {
    const comments = new Map<string, string>();
    const ids: string[] = [];
    const linear: FleetLinear = {
      find: async () => null,
      create: async input => ({
        issueId: input.id,
        identifier: 'JOV-9999',
        url: 'https://linear.app/jovie/issue/JOV-9999',
        fingerprint: input.fingerprint,
      }),
      append: async input => {
        ids.push(input.id);
        if (comments.has(input.id) && comments.get(input.id) !== input.issueId)
          throw new Error('comment collision');
        comments.set(input.id, input.issueId);
      },
    };
    const key = randomUUID();
    for (const profile of [profileId, '44444444-4444-4444-a444-444444444444']) {
      const f = fixture(linear, profile);
      await f.assign();
      const { token, input } = await claimed(f);
      data(await f.invoke('defect.report', input, token, key));
    }
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
  it('allows an authorized replacement lease to reconcile a stale reservation using the same issue ID', async () => {
    const ids: string[] = [];
    let ambiguous = true;
    const f = fixture({
      find: async () => null,
      create: async input => {
        ids.push(input.id);
        if (ambiguous) {
          ambiguous = false;
          throw new Error('ambiguous');
        }
        return {
          issueId: input.id,
          identifier: 'JOV-9999',
          url: 'https://linear.app/jovie/issue/JOV-9999',
          fingerprint: input.fingerprint,
        };
      },
      append: async () => {},
    });
    await f.assign();
    const first = await claimed(f);
    const key = randomUUID();
    await f.invoke('defect.report', first.input, first.token, key);
    f.advance(30001);
    const replacement = await claimed(f, 'other');
    data(await f.invoke('defect.report', replacement.input, replacement.token));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(
      await f.invoke('defect.report', first.input, first.token, key)
    ).toMatchObject({ error: { code: 'CONFLICT' }, status: 'unavailable' });
  });
  it('requires exact approval, consumes it once, and stores only credential hashes', async () => {
    const f = fixture();
    const input = {
      workerId: 'aeon',
      scopes: FLEET_SCOPES,
      expiresAt: '2026-10-01T12:00:00Z',
    };
    const approval = await f.d.approve(
      profileId,
      'founder',
      'provision',
      input
    );
    await expect(
      f.d.control(profileId, 'other', approval, 'provision', input)
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    await expect(
      f.d.control(profileId, 'founder', approval, 'provision', {
        ...input,
        workerId: 'other',
      })
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    const token = (
      await f.d.control(profileId, 'founder', approval, 'provision', input)
    ).token as string;
    expect(JSON.stringify(f.backend.value)).not.toContain(token);
    await expect(
      f.d.control(profileId, 'founder', approval, 'provision', input)
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
    const expired = await f.d.approve(profileId, 'founder', 'revoke', {
      workerId: 'aeon',
    });
    f.advance(120001);
    await expect(
      f.d.control(profileId, 'founder', expired, 'revoke', { workerId: 'aeon' })
    ).rejects.toThrow('CONFIRMATION_REQUIRED');
  });
  it('enforces authentication, scope, profile, worker isolation, and revocation on replays', async () => {
    const f = fixture(),
      token = await f.provision('aeon'),
      other = await f.provision('other', ['fleet:register']);
    expect(await f.invoke('fleet.register', f.registration())).toMatchObject({
      error: { code: 'AUTH_REQUIRED' },
    });
    expect(
      await f.invoke('fleet.register', f.registration(), token + 'x')
    ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    expect(
      await f.d.invoke(
        'fleet.register',
        {
          ...f.envelope(f.registration()),
          context: { profileId: randomUUID(), channel: 'cli' },
        },
        token
      )
    ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
    expect(
      await f.invoke('fleet.register', f.registration('other'), token)
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await f.invoke('fleet.status', {}, other)).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    const key = randomUUID();
    const registered = await f.invoke(
      'fleet.register',
      f.registration(),
      token,
      key
    );
    data(registered);
    expect(
      await f.invoke('fleet.register', f.registration(), token, key)
    ).toEqual(registered);
    expect(
      await f.invoke(
        'fleet.register',
        { ...f.registration(), availability: 'busy' },
        token,
        key
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    await f.control('revoke', { workerId: 'aeon' });
    expect(
      await f.invoke('fleet.register', f.registration(), token, key)
    ).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });
  it('admits one compatible worker, bounded claims, durable terminal evidence and safe retries', async () => {
    const f = fixture(),
      token = await f.provision('aeon'),
      other = await f.provision('other');
    data(await f.invoke('fleet.register', f.registration(), token));
    data(await f.invoke('fleet.register', f.registration('other'), other));
    await f.assign();
    await expect(f.assign()).rejects.toThrow('CONFLICT');
    const offered = await Promise.all([
      f.invoke('work.next', {}, token),
      f.invoke('work.next', {}, other),
    ]);
    expect(offered.filter(r => data(r).lease)).toHaveLength(1);
    const index = offered.findIndex(r => data(r).lease),
      owner = index === 0 ? token : other,
      outsider = index === 0 ? other : token;
    const lease = data(offered[index]).lease;
    expect(
      await f.invoke('work.claim', { leaseId: lease.leaseId }, outsider)
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      await f.invoke(
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'completed',
          summary: 'ok',
          evidence,
        },
        owner
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    const claimed = data(
      await f.invoke('work.claim', { leaseId: lease.leaseId }, owner)
    ).lease;
    f.advance(1000);
    expect(
      data(await f.invoke('work.claim', { leaseId: lease.leaseId }, owner))
        .lease.expiresAt
    ).toBe(claimed.expiresAt);
    expect(
      await f.invoke(
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'completed',
          summary: 'ok',
          evidence: [
            { ref: 'https://example.test/?token=secret', summary: 'x' },
          ],
        },
        owner
      )
    ).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    const input = {
      leaseId: lease.leaseId,
      outcome: 'completed',
      summary: 'ok',
      evidence,
    };
    const terminal = data(await f.invoke('work.report', input, owner)).receipt;
    expect(data(await f.invoke('work.report', input, owner)).receipt).toEqual(
      terminal
    );
    expect(
      await f.invoke('work.report', { ...input, summary: 'changed' }, owner)
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    expect((await f.d.inspect(profileId)).receipts).toHaveLength(1);
    expect(data(await f.invoke('work.next', {}, owner)).lease).toBeNull();
  });
  it('expires offers and claims; old workers cannot report reassigned work', async () => {
    const f = fixture(),
      token = await f.provision('aeon');
    data(await f.invoke('fleet.register', f.registration(), token));
    await f.assign();
    const old = data(await f.invoke('work.next', {}, token)).lease;
    f.advance(60001);
    expect(
      await f.invoke('work.claim', { leaseId: old.leaseId }, token)
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    const next = data(await f.invoke('work.next', {}, token)).lease;
    expect(next.leaseId).not.toBe(old.leaseId);
    data(await f.invoke('work.claim', { leaseId: next.leaseId }, token));
    f.advance(30001);
    expect(
      await f.invoke(
        'work.report',
        {
          leaseId: next.leaseId,
          outcome: 'completed',
          summary: 'too late',
          evidence,
        },
        token
      )
    ).toMatchObject({ error: { code: 'CONFLICT' } });
    expect((await f.d.inspect(profileId)).receipts).toHaveLength(0);
  });
  it('reconciles an ambiguous Linear commit with deterministic issue/comment IDs and dedupes evidence', async () => {
    const issues = new Map<string, Issue>(),
      comments = new Set<string>();
    let creates = 0,
      timeout = true;
    const linear: FleetLinear = {
      find: async fingerprint => issues.get(fingerprint) ?? null,
      create: async input => {
        creates++;
        const issue = {
          issueId: input.id,
          identifier: 'JOV-9999',
          url: 'https://linear.app/jovie/issue/JOV-9999',
          fingerprint: input.fingerprint,
        };
        issues.set(input.fingerprint, issue);
        if (timeout) {
          timeout = false;
          throw new Error('timeout after commit');
        }
        return issue;
      },
      append: async input => {
        comments.add(input.id);
      },
    };
    const f = fixture(linear),
      token = await f.provision('aeon');
    data(await f.invoke('fleet.register', f.registration(), token));
    await f.assign({ maxDurationSeconds: 60 });
    const lease = data(await f.invoke('work.next', {}, token)).lease;
    data(await f.invoke('work.claim', { leaseId: lease.leaseId }, token));
    const input = {
      leaseId: lease.leaseId,
      title: 'API unavailable',
      command: 'api.openapi',
      apiCode: 'RATE_LIMITED',
      details: 'Read failed',
      evidence,
    };
    const key = randomUUID();
    expect(await f.invoke('defect.report', input, token, key)).toMatchObject({
      status: 'unavailable',
    });
    expect(await f.invoke('defect.report', input, token, key)).toMatchObject({
      status: 'in_progress',
    });
    f.advance(30001);
    data(
      await f.invoke(
        'work.report',
        {
          leaseId: lease.leaseId,
          outcome: 'failed',
          summary: 'read failed',
          evidence,
        },
        token
      )
    );
    const result = await f.invoke('defect.report', input, token, key);
    data(result);
    expect(await f.invoke('defect.report', input, token, key)).toEqual(result);
    const another = data(
      await f.invoke(
        'defect.report',
        { ...input, details: 'Additional evidence' },
        token
      )
    );
    expect(another.issueId).toBe(data(result).issueId);
    expect(creates).toBe(1);
    expect(comments.size).toBe(2);
  });
});
