import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OpenKeyScanWorker,
  OpenKeyScanWorkerError,
  type OpenKeyScanWorkerLaunch,
} from './openkeyscan-worker';

const REAL_MP3_PATH = resolve(
  process.cwd(),
  'tests/fixtures/audio/long-vbr-tone.mp3'
);

const FAKE_WORKER_SOURCE = String.raw`
const readline = require('node:readline');
const path = require('node:path');
const mode = process.argv[1];
process.on('SIGTERM', () => process.exit(0));
if (mode === 'never-ready') {
  setInterval(() => {}, 1000);
} else if (mode === 'invalid-ready') {
  process.stdout.write(JSON.stringify({ type: 'ready', extra: true }) + '\n');
} else if (mode === 'stderr-overflow') {
  process.stderr.write('x'.repeat(256));
  setInterval(() => {}, 1000);
} else {
  process.stdout.write(JSON.stringify({ type: 'ready' }) + '\n');
  const lines = readline.createInterface({ input: process.stdin });
  lines.on('line', line => {
    const request = JSON.parse(line);
    if (mode === 'analysis-timeout') return;
    if (mode === 'exit') process.exit(7);
    if (mode === 'provider-error') {
      process.stdout.write(JSON.stringify({
        id: request.id,
        status: 'error',
        error: 'sensitive provider detail',
        filename: path.basename(request.path),
        generation: 0,
      }) + '\n');
      return;
    }
    process.stdout.write(JSON.stringify({
      id: mode === 'wrong-id'
        ? '00000000-0000-4000-8000-000000000000'
        : request.id,
      status: 'success',
      camelot: mode === 'inconsistent' ? '8B' : '11B',
      openkey: '4d',
      key: 'A major',
      class_id: 22,
      filename: path.basename(request.path),
      generation: 0,
    }) + '\n');
  });
}
`;

const workers = new Set<OpenKeyScanWorker>();

function launch(mode = 'success'): OpenKeyScanWorkerLaunch {
  return {
    executable: process.execPath,
    args: ['-e', FAKE_WORKER_SOURCE, mode],
    environment: {},
  };
}

async function start(
  mode = 'success',
  limits: Parameters<typeof OpenKeyScanWorker.start>[1] = {}
): Promise<OpenKeyScanWorker> {
  const worker = await OpenKeyScanWorker.start(launch(mode), {
    startupTimeoutMs: 1_000,
    analysisTimeoutMs: 1_000,
    shutdownGraceMs: 50,
    ...limits,
  });
  workers.add(worker);
  return worker;
}

function expectWorkerError(
  promise: Promise<unknown>,
  code: OpenKeyScanWorkerError['code']
): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    name: 'OpenKeyScanWorkerError',
    code,
  });
}

afterEach(async () => {
  await Promise.all([...workers].map(worker => worker.close()));
  workers.clear();
});

describe('OpenKeyScanWorker', () => {
  it('normalizes a real audio path through an actual NDJSON subprocess', async () => {
    const worker = await start();

    const result = await worker.analyze(REAL_MP3_PATH);

    expect(result).toEqual({
      providerId: 'openkeyscan',
      key: {
        tonic: 'A',
        mode: 'major',
        traditional: 'A major',
        camelot: '11B',
        openKey: '4d',
      },
      providerClassId: 22,
      providerGeneration: 0,
      startupLatencyMs: expect.any(Number),
      analysisLatencyMs: expect.any(Number),
    });
    expect(result.startupLatencyMs).toBeLessThan(1_000);
    expect(result.analysisLatencyMs).toBeLessThan(1_000);
  });

  it('keeps one worker alive for sequential analysis', async () => {
    const worker = await start();

    await expect(worker.analyze(REAL_MP3_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
    await expect(worker.analyze(REAL_MP3_PATH)).resolves.toMatchObject({
      providerId: 'openkeyscan',
    });
  });

  it('rejects relative executables, working directories, audio paths, and unsafe arguments', async () => {
    await expectWorkerError(
      OpenKeyScanWorker.start({ executable: 'python', args: [] }),
      'invalid_configuration'
    );
    await expectWorkerError(
      OpenKeyScanWorker.start({
        executable: process.execPath,
        args: ['-e'],
        cwd: 'relative',
      }),
      'invalid_configuration'
    );
    await expectWorkerError(
      OpenKeyScanWorker.start({
        executable: process.execPath,
        args: ['bad\0argument'],
      }),
      'invalid_configuration'
    );

    const worker = await start();
    await expectWorkerError(
      worker.analyze('relative.mp3'),
      'invalid_configuration'
    );
  });

  it('does not allow concurrent requests to multiply worker memory', async () => {
    const worker = await start('analysis-timeout', {
      analysisTimeoutMs: 500,
    });
    const active = worker.analyze(REAL_MP3_PATH);

    await expectWorkerError(
      worker.analyze(REAL_MP3_PATH),
      'invalid_configuration'
    );
    const activeError = expectWorkerError(active, 'aborted');
    await worker.close();
    await activeError;
  });

  it('cancels analysis and closes the worker', async () => {
    const worker = await start('analysis-timeout');
    const controller = new AbortController();
    const result = worker.analyze(REAL_MP3_PATH, {
      signal: controller.signal,
    });

    controller.abort();

    await expectWorkerError(result, 'aborted');
    await expectWorkerError(worker.analyze(REAL_MP3_PATH), 'worker_exited');
  });

  it('enforces startup and analysis timeouts', async () => {
    await expectWorkerError(
      OpenKeyScanWorker.start(launch('never-ready'), {
        startupTimeoutMs: 30,
        analysisTimeoutMs: 100,
        shutdownGraceMs: 25,
      }),
      'startup_timeout'
    );

    const worker = await start('analysis-timeout', {
      analysisTimeoutMs: 30,
    });
    await expectWorkerError(worker.analyze(REAL_MP3_PATH), 'analysis_timeout');
  });

  it.each([
    ['invalid-ready', 'protocol_error'],
    ['stderr-overflow', 'protocol_error'],
  ] as const)('fails closed when startup mode %s violates the protocol', async (mode, code) => {
    await expectWorkerError(
      OpenKeyScanWorker.start(launch(mode), {
        startupTimeoutMs: 1_000,
        analysisTimeoutMs: 1_000,
        shutdownGraceMs: 25,
        maxStderrBytes: 64,
      }),
      code
    );
  });

  it.each([
    'wrong-id',
    'inconsistent',
  ] as const)('fails closed when a %s response contradicts canonical metadata', async mode => {
    const worker = await start(mode);
    await expectWorkerError(worker.analyze(REAL_MP3_PATH), 'protocol_error');
  });

  it('redacts provider failures at the adapter boundary', async () => {
    const worker = await start('provider-error');

    const result = worker.analyze(REAL_MP3_PATH);

    await expectWorkerError(result, 'provider_error');
    await expect(result).rejects.not.toThrow('sensitive provider detail');
  });

  it('reports unexpected worker exit without leaking process output', async () => {
    const worker = await start('exit');
    await expectWorkerError(worker.analyze(REAL_MP3_PATH), 'worker_exited');
  });

  it('rejects already-aborted startup and analysis signals', async () => {
    const startupController = new AbortController();
    startupController.abort();
    await expectWorkerError(
      OpenKeyScanWorker.start(launch(), {
        signal: startupController.signal,
      }),
      'aborted'
    );

    const worker = await start();
    const analysisController = new AbortController();
    analysisController.abort();
    await expectWorkerError(
      worker.analyze(REAL_MP3_PATH, {
        signal: analysisController.signal,
      }),
      'aborted'
    );
  });
});
