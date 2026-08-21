import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  createSummerRuntimeBridge,
  invokeSummerRuntime,
} from '../src/summer-runtime-bridge';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeChild(input: {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}) {
  const emitter = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(emitter, {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(() => true),
  });
  queueMicrotask(() => {
    if (input.stdout) stdout.write(input.stdout);
    if (input.stderr) stderr.write(input.stderr);
    stdout.end();
    stderr.end();
    emitter.emit('close', input.exitCode ?? 0, null);
  });
  return child;
}

describe('packaged Summer runtime bridge', () => {
  it('uses fixed Hermes argv, stdin-only founder text, and never a shell', async () => {
    const spawnProcess = vi.fn(() =>
      fakeChild({ stdout: 'Summer response\n', stderr: 'private diagnostic' })
    );
    const childInputs: string[] = [];
    spawnProcess.mockImplementation((...args) => {
      const child = fakeChild({ stdout: 'Summer response\n' });
      child.stdin.on('data', chunk => childInputs.push(String(chunk)));
      return child;
    });
    const responseText = await invokeSummerRuntime({
      homeDirectory: '/Users/founder',
      turn: {
        id: 'turn_1',
        conversation_id: 'founder-conversation',
        user_text: 'Ship this; $(touch /tmp/nope)',
        claim_token: 'claim_1',
      },
      spawnProcess,
    });
    expect(responseText).toBe('Summer response');
    expect(spawnProcess).toHaveBeenCalledOnce();
    const [executable, args, options] = spawnProcess.mock.calls[0] ?? [];
    expect(executable).toBe('/Users/founder/.hermes/bin/hermes');
    expect(args).toEqual([
      '-p',
      'summer',
      'chat',
      '-Q',
      '-c',
      expect.stringMatching(/^ovie-founder-[a-f0-9]{24}$/),
      '--create-if-missing',
      '--query-file',
      '-',
      '--source',
      'tool',
    ]);
    expect(args).not.toContain('Ship this; $(touch /tmp/nope)');
    expect(options).toEqual({ shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    expect(childInputs.join('')).toBe('Ship this; $(touch /tmp/nope)');
  });

  it('reuses authenticated session cookies and persists completion', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init });
        if (!init?.method) {
          return response({
            ok: true,
            turns: [
              {
                id: 'turn_1',
                conversation_id: 'conversation_1',
                user_text: 'Founder prompt',
              },
            ],
          });
        }
        const body = JSON.parse(String(init.body)) as { action: string };
        if (body.action === 'claim') {
          return response({
            ok: true,
            turn: {
              id: 'turn_1',
              conversation_id: 'conversation_1',
              user_text: 'Founder prompt',
              claim_token: 'claim_1',
            },
          });
        }
        return response({
          ok: true,
          turn: { id: 'turn_1', state: 'completed' },
        });
      }
    );
    const receipts: unknown[] = [];
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie/app/chat',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ stdout: 'Actual Summer answer' }),
      onReceipt: receipt => receipts.push(receipt),
    });
    await expect(bridge.runCycle()).resolves.toMatchObject({
      state: 'completed',
      turnId: 'turn_1',
    });
    expect(requests).toHaveLength(3);
    expect(
      requests.every(request => request.init?.credentials === 'include')
    ).toBe(true);
    expect(JSON.parse(String(requests[2]?.init?.body))).toMatchObject({
      action: 'complete',
      id: 'turn_1',
      claim_token: 'claim_1',
      response_text: 'Actual Summer answer',
    });
    expect(receipts).toEqual([
      expect.objectContaining({ state: 'completed', turnId: 'turn_1' }),
    ]);
  });

  it('survives an idle heartbeat and completes on the next cycle', async () => {
    let pendingCalls = 0;
    const fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        if (!init?.method) {
          pendingCalls += 1;
          return response({
            ok: true,
            turns:
              pendingCalls === 1
                ? []
                : [
                    {
                      id: 'turn_heartbeat',
                      conversation_id: 'conversation_1',
                      user_text: 'Second cycle',
                    },
                  ],
          });
        }
        const body = JSON.parse(String(init.body)) as { action: string };
        return body.action === 'claim'
          ? response({
              ok: true,
              turn: {
                id: 'turn_heartbeat',
                conversation_id: 'conversation_1',
                user_text: 'Second cycle',
                claim_token: 'claim_heartbeat',
              },
            })
          : response({ ok: true });
      }
    );
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ stdout: 'Heartbeat response' }),
    });
    await expect(bridge.runCycle()).resolves.toMatchObject({ state: 'idle' });
    await expect(bridge.runCycle()).resolves.toMatchObject({
      state: 'completed',
      turnId: 'turn_heartbeat',
    });
  });
});
