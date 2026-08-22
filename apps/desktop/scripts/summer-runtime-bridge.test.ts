import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  createSummerRuntimeBridge,
  invokeSummerRuntime,
  parseSummerRuntimeCompletion,
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

function hangingChild() {
  const emitter = new EventEmitter();
  const stdin = new PassThrough();
  return Object.assign(emitter, {
    stdin,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}

function queueFetch(turn: Record<string, unknown>, claimStatus = 200) {
  const posted: Array<Record<string, unknown>> = [];
  const fetch = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) => {
      if (!init?.method) return response({ ok: true, turns: [turn] });
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posted.push(body);
      if (body.action === 'claim') {
        return response(
          {
            ok: claimStatus === 200,
            turn:
              claimStatus === 200
                ? { ...turn, claim_token: 'claim_1' }
                : undefined,
          },
          claimStatus
        );
      }
      return response({ ok: true });
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
    const completion = await invokeSummerRuntime({
      homeDirectory: '/Users/founder',
      turn: {
        id: 'turn_1',
        conversation_id: 'founder-conversation',
        user_text: 'Ship this; $(touch /tmp/nope)',
        claim_token: 'claim_1',
      },
      spawnProcess,
    });
    expect(completion).toEqual({ responseText: 'Summer response' });
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

  it('strips a safe Summer tool fence and posts it with completion', async () => {
    const { fetch, posted } = queueFetch({
      id: 'turn_tool',
      conversation_id: 'conversation_1',
      user_text: 'Org state?',
    });
    const stdout = [
      'Current org.',
      '```summer-tool',
      JSON.stringify({
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_ok_1',
        summary: 'read-only org snapshot',
      }),
      '```',
      '',
    ].join('\n');
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () =>
        fakeChild({ stdout, stderr: 'private hermes diagnostic' }),
    });
    await expect(bridge.runCycle()).resolves.toMatchObject({
      state: 'completed',
      turnId: 'turn_tool',
    });
    expect(posted.at(-1)).toMatchObject({
      action: 'complete',
      response_text: 'Current org.',
      tool: {
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_ok_1',
        summary: 'read-only org snapshot',
      },
    });
    expect(parseSummerRuntimeCompletion(stdout).responseText).toBe(
      'Current org.'
    );
  });

  it('fences an unsafe tool instead of completing', async () => {
    const { fetch, posted } = queueFetch({
      id: 'turn_unsafe',
      conversation_id: 'conversation_1',
      user_text: 'Upload avatar',
    });
    const stdout = [
      'No.',
      '```summer-tool',
      JSON.stringify({
        name: 'proposeAvatarUpload',
        ok: true,
        receiptId: 'tool_bad',
        summary: 'artist tool',
      }),
      '```',
    ].join('\n');
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ stdout }),
    });
    await expect(bridge.runCycle()).resolves.toMatchObject({
      state: 'runtime-error',
      errorCode: 'summer-unsafe-tool',
    });
    expect(posted.at(-1)).toMatchObject({
      action: 'fail',
      failure_code: 'summer-unsafe-tool',
    });
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

  it('reclaims a server-listed expired turn after a packaged-worker restart', async () => {
    const { fetch, posted } = queueFetch({
      id: 'turn_restart',
      conversation_id: 'conversation_1',
      user_text: 'Resume after restart.',
      state: 'claimed',
    });
    const restartedBridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac-after-restart',
      fetch,
      spawnProcess: () => fakeChild({ stdout: 'Recovered answer' }),
    });
    await expect(restartedBridge.runCycle()).resolves.toMatchObject({
      state: 'completed',
      turnId: 'turn_restart',
    });
    expect(posted[0]).toMatchObject({
      action: 'claim',
      id: 'turn_restart',
      worker_id: 'jovie-mac-after-restart',
    });
    expect(posted[1]).toMatchObject({
      action: 'complete',
      response_text: 'Recovered answer',
    });
  });

  it('cancels the Hermes child without an unhandled stdin EPIPE', async () => {
    const child = hangingChild();
    const stdinErrors: Error[] = [];
    child.stdin.on('error', error => stdinErrors.push(error));
    const controller = new AbortController();
    const result = invokeSummerRuntime({
      homeDirectory: '/Users/founder',
      turn: {
        id: 'turn_cancel',
        conversation_id: 'conversation_1',
        user_text: 'Cancel safely',
        claim_token: 'claim_cancel',
      },
      spawnProcess: () => child,
      signal: controller.signal,
    });
    controller.abort();
    child.stdin.emit('error', new Error('EPIPE'));
    await expect(result).rejects.toThrow('summer-runtime-canceled');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(stdinErrors).toHaveLength(1);
  });

  it('aborts an in-flight Hermes child when the packaged app stops', async () => {
    const child = hangingChild();
    const { fetch } = queueFetch({
      id: 'turn_stop',
      conversation_id: 'conversation_1',
      user_text: 'Background then quit',
    });
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => child,
    });
    const cycle = bridge.runCycle();
    await vi.waitFor(() => {
      expect(fetch.mock.calls.length).toBeGreaterThan(1);
    });
    bridge.stop();
    await expect(cycle).resolves.toMatchObject({
      state: 'runtime-error',
      errorCode: 'summer-runtime-canceled',
    });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('completes a tool-only Summer fence without founder prose', async () => {
    const { fetch, posted } = queueFetch({
      id: 'turn_tool_only',
      conversation_id: 'conversation_1',
      user_text: 'Org state?',
    });
    const stdout = [
      '```summer-tool',
      JSON.stringify({
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_only',
        summary: 'read-only org snapshot',
      }),
      '```',
    ].join('\n');
    const bridge = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ stdout }),
    });
    await expect(bridge.runCycle()).resolves.toMatchObject({
      state: 'completed',
      turnId: 'turn_tool_only',
    });
    expect(posted.at(-1)).toMatchObject({
      action: 'complete',
      response_text: '',
      tool: {
        name: 'get_org_state',
        ok: true,
        receiptId: 'tool_only',
      },
    });
  });

  it('rejects stdout errors instead of completing partial output', async () => {
    const child = hangingChild();
    const result = invokeSummerRuntime({
      homeDirectory: '/Users/founder',
      turn: {
        id: 'turn_stdout',
        conversation_id: 'conversation_1',
        user_text: 'Do not complete partial stdout',
        claim_token: 'claim_stdout',
      },
      spawnProcess: () => child,
    });
    child.stdout.emit('error', new Error('EIO'));
    await expect(result).rejects.toThrow('EIO');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('resumes polling after stop without a competing worker', async () => {
    const { fetch, posted } = queueFetch({
      id: 'turn_resume',
      conversation_id: 'conversation_1',
      user_text: 'Background then resume',
    });
    const first = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ stdout: 'Resumed Summer.' }),
    });
    first.stop();
    const resumed = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac-resume',
      fetch,
      spawnProcess: () => fakeChild({ stdout: 'Resumed Summer.' }),
    });
    await expect(resumed.runCycle()).resolves.toMatchObject({
      state: 'completed',
      turnId: 'turn_resume',
    });
    expect(posted.at(-1)).toMatchObject({
      action: 'complete',
      response_text: 'Resumed Summer.',
    });
  });

  it('stays idle off Darwin and reports a claim conflict without spawning', async () => {
    const linux = createSummerRuntimeBridge({
      platform: 'linux',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch: vi.fn(),
      spawnProcess: () => fakeChild({ stdout: 'nope' }),
    });
    await expect(linux.runCycle()).resolves.toMatchObject({ state: 'idle' });

    const { fetch, posted } = queueFetch(
      {
        id: 'turn_conflict',
        conversation_id: 'conversation_1',
        user_text: 'Already claimed',
      },
      409
    );
    const darwin = createSummerRuntimeBridge({
      platform: 'darwin',
      appOrigin: 'https://jov.ie',
      homeDirectory: '/Users/founder',
      workerId: 'jovie-mac',
      fetch,
      spawnProcess: () => fakeChild({ stdout: 'nope' }),
    });
    await expect(darwin.runCycle()).resolves.toMatchObject({
      state: 'claim-conflict',
      turnId: 'turn_conflict',
    });
    expect(posted).toEqual([
      expect.objectContaining({ action: 'claim', id: 'turn_conflict' }),
    ]);
  });
});
