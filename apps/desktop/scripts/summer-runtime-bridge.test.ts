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
    stdout.end();
    stderr.end();
    emitter.emit('close', input.exitCode ?? 0, null);
  });
  return child;
}

function queueFetch(turn: Record<string, unknown>) {
  const posted: Array<Record<string, unknown>> = [];
  const fetch = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) return response({ ok: true, turns: [turn] });
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posted.push(body);
      return body.action === 'claim'
        ? response({
            ok: true,
            turn: { ...turn, claim_token: 'claim_1' },
          })
        : response({ ok: true });
    }
  );
  return { fetch, posted };
}

describe('packaged Summer runtime bridge', () => {
  it('uses fixed Hermes argv, stdin-only founder text, and never a shell', async () => {
    const childInputs: string[] = [];
    const spawnProcess = vi.fn(() => {
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
    const { fetch, posted } = queueFetch({
      id: 'turn_1',
      conversation_id: 'conversation_1',
      user_text: 'Founder prompt',
    });
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie/app/chat',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ stdout: 'Actual Summer answer' }),
    });
    await expect(bridge.runCycle()).resolves.toMatchObject({
      state: 'completed',
      turnId: 'turn_1',
    });
    expect(
      fetch.mock.calls.every(([, init]) => init?.credentials === 'include')
    ).toBe(true);
    expect(posted[1]).toMatchObject({
      action: 'complete',
      id: 'turn_1',
      claim_token: 'claim_1',
      response_text: 'Actual Summer answer',
    });
  });

  it('posts a fenced failure when Hermes exits unsuccessfully', async () => {
    const { fetch, posted } = queueFetch({
      id: 'turn_failed',
      conversation_id: 'conversation_1',
      user_text: 'Founder prompt',
    });
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ exitCode: 1 }),
    });
    await expect(bridge.runCycle()).resolves.toMatchObject({
      state: 'runtime-error',
      errorCode: 'summer-runtime-exit-1',
    });
    expect(posted.at(-1)).toMatchObject({
      action: 'fail',
      id: 'turn_failed',
      claim_token: 'claim_1',
      failure_code: 'summer-runtime-exit-1',
    });
  });
});
