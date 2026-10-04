import { FLEET_SCOPES } from '@jovie/action-contracts';
import { describe, expect, it, vi } from 'vitest';
import { type FleetBackend, FleetDispatcher } from './dispatcher';
import { handleFleetControl, handleFleetInvocation } from './http';

const profileId = '11111111-1111-4111-a111-111111111111';
function fixture(enabled = true) {
  let stored: unknown = null;
  const backend: FleetBackend = {
    async get() {
      return structuredClone(stored);
    },
    async setIfAbsent(_key, value) {
      if (stored !== null) return false;
      stored = structuredClone(value);
      return true;
    },
    async compareAndSet(_key, before, after) {
      if (JSON.stringify(before) !== JSON.stringify(stored)) return false;
      stored = structuredClone(after);
      return true;
    },
  };
  const dispatcher = new FleetDispatcher({ backend, enabled });
  const founder = vi.fn(async (): Promise<string | null> => 'founder');
  const deps = { dispatcher, founder };
  const envelope = {
    schemaVersion: 1,
    idempotencyKey: 'http-register-key',
    context: { profileId, channel: 'cli', clientVersion: 'test' },
    input: {
      workerId: 'aeon',
      runtimeClass: 'codex',
      capabilities: ['api.openapi'],
      tools: ['jovie'],
      connectors: [],
      availability: 'available',
    },
  };
  return { dispatcher, deps, envelope };
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://jov.ie/api/v1/actions/fleet.register/invoke', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('fleet HTTP authority and canonical receipts', () => {
  it('preserves REST and dispatcher receipts and prevents worker credential escalation', async () => {
    const f = fixture();
    const input = {
      workerId: 'aeon',
      scopes: FLEET_SCOPES,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
    const approval = await f.dispatcher.approve(
      profileId,
      'founder',
      'provision',
      input
    );
    const { token } = await f.dispatcher.control(
      profileId,
      'founder',
      approval,
      'provision',
      input
    );
    const headers = { Authorization: `Bearer ${token}` };
    const response = await handleFleetInvocation(
      request(f.envelope, headers),
      'fleet.register',
      f.deps
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(
      await f.dispatcher.invoke('fleet.register', f.envelope, String(token))
    );
    const control = request(
      { profileId, operation: 'provision', input: {} },
      {
        ...headers,
        Origin: 'https://jov.ie',
      }
    );
    expect((await handleFleetControl(control, 'approve', f.deps)).status).toBe(
      403
    );
    const crossOrigin = request(
      { profileId },
      { Origin: 'https://attacker.test' }
    );
    expect(
      (await handleFleetControl(crossOrigin, 'status', f.deps)).status
    ).toBe(403);
    expect(f.deps.founder).not.toHaveBeenCalled();
  });

  it('preserves authentication denial and disabled-runtime status without granting authority', async () => {
    for (const [enabled, status, code] of [
      [true, 401, 'AUTH_REQUIRED'],
      [false, 503, 'FEATURE_DISABLED'],
    ] as const) {
      const f = fixture(enabled);
      const response = await handleFleetInvocation(
        request(f.envelope),
        'fleet.register',
        f.deps
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        status: 'unavailable',
        error: { code },
      });
    }
  });

  it('rejects unknown actions before reading the request or invoking the dispatcher', async () => {
    const f = fixture();
    const invoke = vi.spyOn(f.dispatcher, 'invoke');
    const response = await handleFleetInvocation(
      request({}),
      'task.create',
      f.deps
    );
    expect(response.status).toBe(404);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('bounds input independently of Content-Length and cancels oversized bodies', async () => {
    const f = fixture();
    const invoke = vi.spyOn(f.dispatcher, 'invoke');
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(32769));
      },
      cancel() {
        canceled = true;
      },
    });
    const req = new Request(
      'https://jov.ie/api/v1/actions/fleet.register/invoke',
      {
        method: 'POST',
        headers: { 'Content-Length': '1' },
        body: stream,
        duplex: 'half',
      } as RequestInit
    );
    const response = await handleFleetInvocation(req, 'fleet.register', f.deps);
    expect(response.status).toBe(400);
    expect(canceled).toBe(true);
    expect(stream.locked).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects pre-aborted bodies and releases the reader without downstream calls', async () => {
    const f = fixture();
    const invoke = vi.spyOn(f.dispatcher, 'invoke');
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    });
    const req = new Request(
      'https://jov.ie/api/v1/actions/fleet.register/invoke',
      {
        method: 'POST',
        body: stream,
        duplex: 'half',
        signal: AbortSignal.abort(),
      } as RequestInit
    );
    expect(
      (await handleFleetInvocation(req, 'fleet.register', f.deps)).status
    ).toBe(400);
    expect(canceled).toBe(true);
    expect(stream.locked).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('requires a founder session, approval receipt, and canonical mission verifier', async () => {
    const f = fixture();
    f.deps.founder.mockResolvedValueOnce(null);
    expect(
      (
        await handleFleetControl(
          request({ profileId }, { Origin: 'https://jov.ie' }),
          'status',
          f.deps
        )
      ).status
    ).toBe(403);
    const control = { profileId, operation: 'provision', input: {} };
    expect(
      (
        await handleFleetControl(
          request(control, { Origin: 'https://jov.ie' }),
          'execute',
          f.deps
        )
      ).status
    ).toBe(403);
    const assign = { ...control, operation: 'assign' };
    expect(
      (
        await handleFleetControl(
          request(assign, { Origin: 'https://jov.ie' }),
          'approve',
          f.deps
        )
      ).status
    ).toBe(409);
  });

  it('cancels a stalled body at its deadline and releases the reader', async () => {
    const f = fixture();
    const invoke = vi.spyOn(f.dispatcher, 'invoke');
    const deadline = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(deadline.signal);
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    });
    try {
      const req = new Request(
        'https://jov.ie/api/v1/actions/fleet.register/invoke',
        {
          method: 'POST',
          body: stream,
          duplex: 'half',
        } as RequestInit
      );
      const pending = handleFleetInvocation(req, 'fleet.register', f.deps);
      expect(timeout).toHaveBeenCalledWith(5000);
      deadline.abort();
      expect((await pending).status).toBe(400);
      expect(canceled).toBe(true);
      expect(stream.locked).toBe(false);
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });
});
