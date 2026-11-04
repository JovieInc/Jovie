import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runVitest } from '../../../scripts/test-fast.mjs';
import {
  localMaxWorkers,
  withLocalWorkerLimit,
} from '../../../scripts/vitest-local-workers.mjs';

describe('localMaxWorkers', () => {
  it('keeps the vitest default on an idle host', () => {
    expect(localMaxWorkers({ env: {}, cpus: 16, load1: 3 })).toBeUndefined();
  });

  it('takes a quarter of the cores (min 2) once load reaches half the cores', () => {
    expect(localMaxWorkers({ env: {}, cpus: 16, load1: 8 })).toBe(4);
    expect(localMaxWorkers({ env: {}, cpus: 4, load1: 20 })).toBe(2);
  });

  it('lets VITEST_LOCAL_MAX_WORKERS override, ignoring junk', () => {
    expect(
      localMaxWorkers({
        env: { VITEST_LOCAL_MAX_WORKERS: '6' },
        cpus: 16,
        load1: 0,
      })
    ).toBe(6);
    expect(
      localMaxWorkers({
        env: { VITEST_LOCAL_MAX_WORKERS: 'x' },
        cpus: 16,
        load1: 0,
      })
    ).toBeUndefined();
  });
});

function launcherArgs(): string[] {
  const args = vi.mocked(spawn).mock.calls[0]?.[1];
  return Array.isArray(args) ? args : [];
}

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

describe('fast launcher worker policy', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0, null));
      return child as ChildProcess;
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('applies the local override before launching Vitest', async () => {
    vi.stubEnv('CI', '');
    vi.stubEnv('VITEST_LOCAL_MAX_WORKERS', '3');
    expect(
      await runVitest(['tests/unit/ci/vitest-local-workers.test.ts'])
    ).toBe(0);
    expect(launcherArgs()).toContain('--maxWorkers=3');
  });

  it('keeps CI worker policy in the existing Vitest configuration', async () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('VITEST_LOCAL_MAX_WORKERS', '3');
    expect(await runVitest([])).toBe(0);
    expect(launcherArgs().some(arg => arg.startsWith('--maxWorkers'))).toBe(
      false
    );
  });

  it('preserves an explicit CLI limit', async () => {
    vi.stubEnv('CI', '');
    vi.stubEnv('VITEST_LOCAL_MAX_WORKERS', '3');
    expect(await runVitest(['--maxWorkers=6'])).toBe(0);
    expect(launcherArgs()).toContain('--maxWorkers=6');
    expect(launcherArgs()).not.toContain('--maxWorkers=3');
  });
});

describe('withLocalWorkerLimit', () => {
  it('retains the existing CI policy even under load and a local override', () => {
    const args = ['run'];
    expect(
      withLocalWorkerLimit(args, {
        env: { CI: 'true', VITEST_LOCAL_MAX_WORKERS: '8' },
        cpus: 16,
        load1: 20,
      })
    ).toBe(args);
  });
  it('retains explicit camel and kebab CLI limits', () => {
    for (const args of [
      ['--maxWorkers=6'],
      ['--maxWorkers', '6'],
      ['--max-workers=6'],
      ['--max-workers', '6'],
    ]) {
      expect(withLocalWorkerLimit(args, { env: {}, cpus: 16, load1: 20 })).toBe(
        args
      );
    }
  });
  it('retains the idle-host default without mutating arguments', () => {
    const args = ['run'];
    expect(withLocalWorkerLimit(args, { env: {}, cpus: 16, load1: 0 })).toBe(
      args
    );
  });
  it('adds the bounded local worker cap on a loaded host', () => {
    expect(
      withLocalWorkerLimit(['run'], { env: {}, cpus: 16, load1: 8 })
    ).toEqual(['run', '--maxWorkers=4']);
  });
  it('honors the existing local environment override', () => {
    expect(
      withLocalWorkerLimit(['related', 'lib/example.ts'], {
        env: { VITEST_LOCAL_MAX_WORKERS: '3' },
        cpus: 16,
        load1: 0,
      })
    ).toEqual(['related', 'lib/example.ts', '--maxWorkers=3']);
  });
});
