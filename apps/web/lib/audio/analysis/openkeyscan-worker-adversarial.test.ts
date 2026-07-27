import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertOpenKeyScanCanAnalyze,
  buildOpenKeyScanEnvironment,
  canAcceptOpenKeyScanResponse,
  exceedsOpenKeyScanByteLimit,
  isOpenKeyScanWorkerTerminal,
  isUnexpectedOpenKeyScanExit,
  OPENKEYSCAN_SPAWN_INVARIANTS,
  OPENKEYSCAN_WORKER_STATE,
  OpenKeyScanWorker,
  type OpenKeyScanWorkerLaunch,
  requireOpenKeyScanPendingResponse,
} from './openkeyscan-worker';

const AUDIO_PATH = resolve(
  process.cwd(),
  'tests/fixtures/audio/long-vbr-tone.mp3'
);
const SOURCE = String.raw`
const readline = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const mode = process.argv[1];
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
process.on('SIGTERM', () => {
  if (mode !== 'ignore-term') process.exit(0);
});
if (mode === 'ignore-term') setInterval(() => {}, 1000);
const listen = () => {
  const lines = readline.createInterface({ input: process.stdin });
  lines.on('line', line => {
    const request = JSON.parse(line);
    const success = {
      id: request.id,
      status: 'success',
      camelot: '11B',
      openkey: '4d',
      key: 'A major',
      class_id: 22,
      filename: path.basename(request.path),
      generation: 0,
    };
    if (mode === 'heartbeat') send({ type: 'heartbeat' });
    if (mode === 'delayed') setTimeout(() => send(success), 15);
    else if (mode === 'duplicate') {
      send(success);
      setTimeout(() => send(success), 5);
    } else send(success);
  });
};
if (mode === 'never-ready') setInterval(() => {}, 1000);
else if (mode === 'heartbeat-before') send({ type: 'heartbeat' });
else if (mode === 'invalid-json') process.stdout.write('{broken\n');
else if (mode === 'oversized-line') process.stdout.write('x'.repeat(80));
else if (mode === 'ready-then-oversized-tail') {
  process.stdout.write('{"type":"ready"}\n' + 'x'.repeat(80));
}
else if (mode === 'leading-newline') {
  process.stdout.write('\n{"type":"ready"}\n');
  listen();
}
else if (mode === 'null-message') send(null);
else if (mode === 'scalar-message') send('ready');
else if (mode === 'array-message') send(['ready']);
else if (mode === 'typeless-message') send({});
else if (mode === 'unknown') {
  send({ type: 'ready' });
  setTimeout(() => send({ type: 'other' }), 5);
} else if (mode === 'idle-heartbeat') {
  send({ type: 'ready' });
  setTimeout(() => send({ type: 'heartbeat' }), 5);
  setTimeout(listen, 15);
} else if (mode === 'duplicate-ready') {
  send({ type: 'ready' });
  setTimeout(() => send({ type: 'ready' }), 5);
  setTimeout(listen, 15);
} else if (mode === 'launch-contract') {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOWED === 'yes' &&
    process.cwd() === process.argv[2]
  ) {
    send({ type: 'ready' });
    listen();
  } else {
    send({ type: 'invalid-launch-contract' });
  }
} else if (mode === 'close-input') {
  send({ type: 'ready' });
  fs.closeSync(0);
  setInterval(() => {}, 1000);
} else if (mode === 'chunked-ready') {
  process.stdout.write('  \n{"type":');
  setTimeout(() => {
    process.stdout.write('"ready"}\n');
    listen();
  }, 5);
} else {
  if (mode === 'stderr-64') process.stderr.write('x'.repeat(64));
  if (mode === 'stderr-65') process.stderr.write('x'.repeat(65));
  send({ type: 'ready' });
  listen();
  if (mode === 'exit-after-ready') setTimeout(() => process.exit(0), 5);
}
`;

const workers = new Set<OpenKeyScanWorker>();
const launch = (
  mode = 'success',
  overrides: Partial<OpenKeyScanWorkerLaunch> = {}
): OpenKeyScanWorkerLaunch => ({
  executable: process.execPath,
  args: ['-e', SOURCE, mode],
  environment: {},
  ...overrides,
});
const limits = {
  startupTimeoutMs: 500,
  analysisTimeoutMs: 500,
  shutdownGraceMs: 20,
} as const;

async function start(
  mode = 'success',
  overrides: Parameters<typeof OpenKeyScanWorker.start>[1] = {}
) {
  const worker = await OpenKeyScanWorker.start(launch(mode), {
    ...limits,
    ...overrides,
  });
  workers.add(worker);
  return worker;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({
    name: 'OpenKeyScanWorkerError',
    code,
  });
}

afterEach(async () => {
  await Promise.all([...workers].map(worker => worker.close()));
  workers.clear();
});

describe('OpenKeyScanWorker adversarial boundaries', () => {
  it('pins a secret-free production subprocess contract', () => {
    expect(OPENKEYSCAN_SPAWN_INVARIANTS).toEqual({
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    expect(buildOpenKeyScanEnvironment(undefined)).toEqual({
      NODE_ENV: 'production',
    });
    expect(buildOpenKeyScanEnvironment({ ALLOWED: 'yes' })).toEqual({
      ALLOWED: 'yes',
      NODE_ENV: 'production',
    });
    expect(buildOpenKeyScanEnvironment({ NODE_ENV: 'development' })).toEqual({
      NODE_ENV: 'production',
    });
  });

  it('defines every worker transition and byte boundary exhaustively', () => {
    expect(OPENKEYSCAN_WORKER_STATE).toEqual({
      starting: 'starting',
      ready: 'ready',
      closing: 'closing',
      closed: 'closed',
    });
    expect(
      Object.values(OPENKEYSCAN_WORKER_STATE).map(state => ({
        state,
        acceptsWithoutRequest: canAcceptOpenKeyScanResponse(state, null),
        acceptsWithRequest: canAcceptOpenKeyScanResponse(state, {}),
        terminal: isOpenKeyScanWorkerTerminal(state),
        unexpectedExit: isUnexpectedOpenKeyScanExit(state),
      }))
    ).toEqual([
      {
        state: 'starting',
        acceptsWithoutRequest: false,
        acceptsWithRequest: false,
        terminal: false,
        unexpectedExit: true,
      },
      {
        state: 'ready',
        acceptsWithoutRequest: false,
        acceptsWithRequest: true,
        terminal: false,
        unexpectedExit: true,
      },
      {
        state: 'closing',
        acceptsWithoutRequest: false,
        acceptsWithRequest: false,
        terminal: true,
        unexpectedExit: false,
      },
      {
        state: 'closed',
        acceptsWithoutRequest: false,
        acceptsWithRequest: false,
        terminal: true,
        unexpectedExit: true,
      },
    ]);
    expect(exceedsOpenKeyScanByteLimit(63, 64)).toBe(false);
    expect(exceedsOpenKeyScanByteLimit(64, 64)).toBe(false);
    expect(exceedsOpenKeyScanByteLimit(65, 64)).toBe(true);

    expect(() =>
      assertOpenKeyScanCanAnalyze(OPENKEYSCAN_WORKER_STATE.ready)
    ).not.toThrow();
    for (const state of [
      OPENKEYSCAN_WORKER_STATE.starting,
      OPENKEYSCAN_WORKER_STATE.closing,
      OPENKEYSCAN_WORKER_STATE.closed,
    ]) {
      expect(() => assertOpenKeyScanCanAnalyze(state)).toThrow(
        expect.objectContaining({ code: 'worker_exited' })
      );
    }

    const pending = { id: 'pending' };
    expect(
      requireOpenKeyScanPendingResponse(OPENKEYSCAN_WORKER_STATE.ready, pending)
    ).toBe(pending);
    for (const [state, request] of [
      [OPENKEYSCAN_WORKER_STATE.starting, pending],
      [OPENKEYSCAN_WORKER_STATE.closing, pending],
      [OPENKEYSCAN_WORKER_STATE.closed, pending],
      [OPENKEYSCAN_WORKER_STATE.ready, null],
    ] as const) {
      expect(() => requireOpenKeyScanPendingResponse(state, request)).toThrow(
        'analyzer returned an unexpected message'
      );
    }
  });

  it('accepts an explicit valid subprocess environment', async () => {
    const worker = await OpenKeyScanWorker.start(
      launch('success', { environment: { ALLOWED: 'yes' } }),
      limits
    );
    workers.add(worker);
    await expect(worker.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
  });

  it('passes the pinned environment and working directory to the child', async () => {
    const cwd = process.cwd();
    const worker = await OpenKeyScanWorker.start(
      launch('launch-contract', {
        args: ['-e', SOURCE, 'launch-contract', cwd],
        cwd,
        environment: { ALLOWED: 'yes' },
      }),
      limits
    );
    workers.add(worker);
    await expect(worker.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
  });

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid resource limit %s', async value => {
    await expectCode(
      OpenKeyScanWorker.start(launch(), {
        ...limits,
        startupTimeoutMs: value,
      }),
      'invalid_configuration'
    );
  });

  it.each([
    { '': 'value' },
    { 'BAD=KEY': 'value' },
    { 'BAD\0KEY': 'value' },
    { GOOD: 'bad\0value' },
  ] as ReadonlyArray<
    Readonly<Record<string, string>>
  >)('rejects invalid child environment %#', async environment => {
    await expectCode(
      OpenKeyScanWorker.start(launch('success', { environment }), limits),
      'invalid_configuration'
    );
  });

  it('rejects empty arguments and reports spawn failure', async () => {
    await expectCode(
      OpenKeyScanWorker.start(launch('success', { args: [''] }), limits),
      'invalid_configuration'
    );
    await expectCode(
      OpenKeyScanWorker.start(
        launch('success', { args: ['valid', 'bad\0argument'] }),
        limits
      ),
      'invalid_configuration'
    );
    await expectCode(
      OpenKeyScanWorker.start(
        launch('success', { executable: '/definitely/missing/openkeyscan' }),
        limits
      ),
      'worker_exited'
    );
  });

  it('cancels startup after the child has launched', async () => {
    const controller = new AbortController();
    const result = OpenKeyScanWorker.start(launch('never-ready'), {
      ...limits,
      signal: controller.signal,
    });
    const rejection = expectCode(result, 'aborted');
    controller.abort();
    await rejection;
  });

  it('removes startup cancellation and timeout hooks after readiness', async () => {
    const controller = new AbortController();
    const worker = await start('success', {
      signal: controller.signal,
      startupTimeoutMs: 200,
    });
    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 225));
    await expect(worker.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
  });

  it.each([
    'heartbeat-before',
    'invalid-json',
    'oversized-line',
    'ready-then-oversized-tail',
    'null-message',
    'scalar-message',
    'array-message',
    'typeless-message',
  ] as const)('fails closed on malformed startup mode %s', async mode => {
    await expectCode(
      OpenKeyScanWorker.start(launch(mode), {
        ...limits,
        maxLineBytes: 32,
      }),
      'protocol_error'
    );
  });

  it('accepts chunked ready output and post-ready heartbeats', async () => {
    const leadingNewline = await start('leading-newline');
    await expect(leadingNewline.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });

    const chunked = await start('chunked-ready');
    await expect(chunked.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });

    const heartbeat = await start('heartbeat');
    await expect(heartbeat.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });

    const idleHeartbeat = await start('idle-heartbeat');
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(idleHeartbeat.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
  });

  it('enforces stderr byte limits at the exact boundary', async () => {
    const exact = await start('stderr-64', { maxStderrBytes: 64 });
    expect(exact).toBeInstanceOf(OpenKeyScanWorker);
    await expectCode(
      OpenKeyScanWorker.start(launch('stderr-65'), {
        ...limits,
        maxStderrBytes: 64,
      }),
      'protocol_error'
    );
  });

  it('rejects unexpected and duplicate messages after readiness', async () => {
    const unknown = await start('unknown');
    await new Promise(resolve => setTimeout(resolve, 15));
    await expectCode(unknown.analyze(AUDIO_PATH), 'worker_exited');

    const duplicate = await start('duplicate');
    await expect(duplicate.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
    await new Promise(resolve => setTimeout(resolve, 15));
    await expectCode(duplicate.analyze(AUDIO_PATH), 'worker_exited');

    const duplicateReady = await start('duplicate-ready');
    await new Promise(resolve => setTimeout(resolve, 20));
    await expectCode(duplicateReady.analyze(AUDIO_PATH), 'worker_exited');
  });

  it('removes completed request timers and abort listeners', async () => {
    const worker = await start('delayed', { analysisTimeoutMs: 40 });
    const controller = new AbortController();
    const first = await worker.analyze(AUDIO_PATH, {
      signal: controller.signal,
    });
    expect(first.startupLatencyMs).toBeGreaterThan(0);
    expect(first.analysisLatencyMs).toBeGreaterThan(0);

    controller.abort();
    await new Promise(resolve => setTimeout(resolve, 50));
    await expect(worker.analyze(AUDIO_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
  });

  it('fails closed when the child closes its request pipe', async () => {
    const worker = await start('close-input');
    await new Promise(resolve => setTimeout(resolve, 20));
    await expectCode(worker.analyze(AUDIO_PATH), 'worker_exited');
  });

  it('escalates shutdown and keeps close idempotent', async () => {
    const worker = await start('ignore-term');
    const startedAt = Date.now();
    await worker.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    const secondCloseStartedAt = Date.now();
    await worker.close();
    expect(Date.now() - secondCloseStartedAt).toBeLessThan(10);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
    await expectCode(worker.analyze(AUDIO_PATH), 'worker_exited');
  });

  it('finishes cooperative shutdown before the escalation deadline', async () => {
    const worker = await start('success', { shutdownGraceMs: 250 });
    const startedAt = Date.now();
    await worker.close();
    expect(Date.now() - startedAt).toBeLessThan(150);
  });

  it('closes cleanly after the child already exited', async () => {
    const worker = await start('exit-after-ready');
    await new Promise(resolve => setTimeout(resolve, 15));
    await worker.close();
    await expectCode(worker.analyze(AUDIO_PATH), 'worker_exited');
  });
});
