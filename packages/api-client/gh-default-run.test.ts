import { EventEmitter } from 'node:events';
import { writeSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const child = vi.hoisted(() => ({
  spawn: vi.fn(),
}));
vi.mock('node:child_process', () => child);

import { FakeClock } from './fake-provider.ts';
import { ghCredential, ghStdoutBytes, runGh, splitIncluded } from './gh.ts';
import { credentialState } from './policy.ts';
import { MemoryLedgerStore } from './store.ts';

const quiet = () => undefined;
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);

type SpawnChild = EventEmitter & {
  stdout: PassThrough | null;
  stderr: PassThrough | null;
  kill: ReturnType<typeof vi.fn>;
};

function makePipeChild(opts: {
  stdout?: Buffer | string;
  stderr?: Buffer | string;
  code?: number | null;
  error?: Error;
}): SpawnChild {
  const proc = new EventEmitter() as SpawnChild;
  proc.kill = vi.fn();
  proc.stderr = new PassThrough();
  proc.stdout = new PassThrough();
  queueMicrotask(() => {
    if (opts.error) {
      proc.emit('error', opts.error);
      return;
    }
    if (opts.stdout !== undefined) {
      const buf =
        typeof opts.stdout === 'string'
          ? Buffer.from(opts.stdout)
          : opts.stdout;
      proc.stdout!.emit('data', buf);
    }
    proc.stdout!.emit('end');
    if (opts.stderr !== undefined) {
      const buf =
        typeof opts.stderr === 'string'
          ? Buffer.from(opts.stderr)
          : opts.stderr;
      proc.stderr!.emit('data', buf);
    }
    proc.stderr!.emit('end');
    proc.emit('close', opts.code === undefined ? 0 : opts.code);
  });
  return proc;
}

function makeFileChild(opts: {
  bytes?: Buffer;
  stderr?: Buffer | string;
  code?: number | null;
  error?: Error;
  missingStderr?: boolean;
}): (
  cmd: string,
  argv: string[],
  spawnOpts: { stdio: unknown[] }
) => SpawnChild {
  return (_cmd, _argv, spawnOpts) => {
    const fd = spawnOpts.stdio[1];
    if (typeof fd === 'number' && opts.bytes) writeSync(fd, opts.bytes);
    const proc = new EventEmitter() as SpawnChild;
    proc.kill = vi.fn();
    proc.stdout = null;
    if (opts.missingStderr) {
      proc.stderr = null;
      return proc;
    }
    proc.stderr = new PassThrough();
    queueMicrotask(() => {
      if (opts.error) {
        proc.emit('error', opts.error);
        return;
      }
      if (opts.stderr !== undefined) {
        const buf =
          typeof opts.stderr === 'string'
            ? Buffer.from(opts.stderr)
            : opts.stderr;
        proc.stderr!.emit('data', buf);
      }
      proc.stderr!.emit('end');
      proc.emit('close', opts.code === undefined ? 0 : opts.code);
    });
    return proc;
  };
}

describe('gh defaultRun capture paths', () => {
  beforeEach(() => {
    child.spawn.mockReset();
  });

  it('captures pipe stdout for ordinary api calls', async () => {
    const body =
      'HTTP/2.0 200 OK\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 999\nX-Ratelimit-Reset: 9999999999\nX-Ratelimit-Resource: core\n\n{"ok":true}';
    child.spawn.mockImplementation(() => makePipeChild({ stdout: body }));
    const result = await runGh(['api', 'repos/o/r'], {
      store: new MemoryLedgerStore(),
      credential: 'pipe',
      log: quiet,
      env: {},
    });
    expect(result).toMatchObject({
      code: 0,
      deferred: false,
      stdout: '{"ok":true}',
    });
    expect(child.spawn).toHaveBeenCalledWith(
      'gh',
      ['api', '--include', 'repos/o/r'],
      expect.objectContaining({ stdio: ['inherit', 'pipe', 'pipe'] })
    );
  });

  it('resolves pipe spawn errors as code 127', async () => {
    child.spawn.mockImplementation(() =>
      makePipeChild({ error: new Error('ENOENT gh') })
    );
    const result = await runGh(['api', 'repos/o/r'], {
      store: new MemoryLedgerStore(),
      credential: 'pipe-err',
      log: quiet,
      env: {},
    });
    expect(result.code).toBe(127);
    expect(result.stderr).toContain('ENOENT');
  });

  it('treats a null pipe exit code as 1', async () => {
    child.spawn.mockImplementation(() =>
      makePipeChild({ stdout: '', stderr: 'boom', code: null })
    );
    const result = await runGh(['api', 'repos/o/r'], {
      store: new MemoryLedgerStore(),
      credential: 'pipe-null',
      log: quiet,
      env: {},
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('boom');
  });

  it('writes zip bodies through a file fd without --include', async () => {
    const args = ['api', 'repos/o/r/actions/artifacts/9/zip'] as const;
    child.spawn.mockImplementation(makeFileChild({ bytes: ZIP }));
    const result = await runGh([...args], {
      store: new MemoryLedgerStore(),
      credential: 'zip-file',
      log: quiet,
      env: { GH_FORCE_TTY: '0' },
    });
    expect(result.code).toBe(0);
    expect(ghStdoutBytes(result.stdout, args)).toEqual(ZIP);
    expect(child.spawn.mock.calls[0]?.[1]).toEqual([...args]);
    expect(child.spawn.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        stdio: ['inherit', expect.any(Number), 'pipe'],
      })
    );
  });

  it('surfaces spawn throws on file stdout as code 127', async () => {
    child.spawn.mockImplementation(() => {
      throw new Error('spawn blocked');
    });
    const result = await runGh(['api', 'repos/o/r/actions/artifacts/1/zip'], {
      store: new MemoryLedgerStore(),
      credential: 'zip-throw',
      log: quiet,
      env: {},
    });
    expect(result.code).toBe(127);
    expect(result.stderr).toContain('spawn blocked');
  });

  it('rejects a missing stderr pipe on file stdout', async () => {
    child.spawn.mockImplementation(makeFileChild({ missingStderr: true }));
    const result = await runGh(['api', 'repos/o/r/actions/artifacts/1/zip'], {
      store: new MemoryLedgerStore(),
      credential: 'zip-stderr',
      log: quiet,
      env: {},
    });
    expect(result.code).toBe(127);
    expect(result.stderr).toContain('stderr pipe missing');
    expect(child.spawn.mock.results[0]?.value.kill).toHaveBeenCalled();
  });

  it('finishes file capture on child error and null close', async () => {
    child.spawn.mockImplementationOnce(
      makeFileChild({ bytes: ZIP, error: new Error('broken pipe') })
    );
    const errored = await runGh(['api', 'repos/o/r/actions/artifacts/2/zip'], {
      store: new MemoryLedgerStore(),
      credential: 'zip-err',
      log: quiet,
      env: {},
    });
    expect(errored.code).toBe(127);
    expect(errored.stderr).toContain('broken pipe');

    child.spawn.mockImplementationOnce(
      makeFileChild({ bytes: ZIP, stderr: 'warn', code: null })
    );
    const closed = await runGh(['api', 'repos/o/r/actions/artifacts/3/zip'], {
      store: new MemoryLedgerStore(),
      credential: 'zip-null',
      log: quiet,
      env: {},
    });
    expect(closed.code).toBe(1);
    expect(closed.stderr).toContain('warn');
    expect(
      ghStdoutBytes(closed.stdout, ['api', 'repos/o/r/actions/artifacts/3/zip'])
    ).toEqual(ZIP);
  });

  it('returns null from splitIncluded when headers lack a blank line', () => {
    expect(
      splitIncluded('HTTP/2.0 200 OK\nX-Ratelimit-Remaining: 1')
    ).toBeNull();
  });

  it('hashes GH_TOKEN when JOVIE_GITHUB_CREDENTIAL is unset', () => {
    const a = ghCredential({ GH_TOKEN: 'token-a' });
    const b = ghCredential({ GITHUB_TOKEN: 'token-a' });
    const c = ghCredential({ GH_TOKEN: 'token-b' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe('gh-cli-login');
  });

  it('ignores invalid rate_limit JSON for quota observations', async () => {
    child.spawn.mockImplementation(() =>
      makePipeChild({
        stdout:
          'HTTP/2.0 200 OK\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 10\nX-Ratelimit-Reset: 9999999999\nX-Ratelimit-Resource: core\n\nnot-json',
      })
    );
    const result = await runGh(['api', 'rate_limit'], {
      store: new MemoryLedgerStore(),
      credential: 'bad-json',
      log: quiet,
      env: {},
    });
    expect(result).toMatchObject({
      code: 0,
      deferred: false,
      stdout: 'not-json',
    });
  });

  it('passes non-idempotent transient failures through without retry', async () => {
    child.spawn.mockImplementation(() =>
      makePipeChild({
        code: 1,
        stdout:
          'HTTP/2.0 502 Bad Gateway\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 10\nX-Ratelimit-Reset: 9999999999\nX-Ratelimit-Resource: core\n\n',
        stderr: '',
      })
    );
    const result = await runGh(
      ['api', '-X', 'POST', 'repos/o/r/issues', '-f', 'title=x'],
      {
        store: new MemoryLedgerStore(),
        credential: 'write-transient',
        log: quiet,
        env: {},
        maxAttempts: 3,
      }
    );
    expect(result).toMatchObject({ code: 1, deferred: false });
    expect(child.spawn).toHaveBeenCalledTimes(1);
  });

  it('uses the default log helper when shedding', async () => {
    const clock = new FakeClock();
    const store = new MemoryLedgerStore();
    await store.transact('github', ledger => {
      credentialState(ledger, 'default-log', clock.now).buckets.core = {
        limit: 1000,
        remaining: 0,
        resetAt: clock.now + 60_000,
        observedAt: clock.now,
      };
    });
    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((
      chunk: string | Uint8Array
    ) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
    try {
      const result = await runGh(['api', 'repos/o/r'], {
        store,
        credential: 'default-log',
        now: clock.read,
        sleep: clock.sleep,
        env: {},
        maxWaitMs: 0,
        // Intentionally omit log to exercise the default stderr writer.
      });
      expect(result).toMatchObject({ code: 75, deferred: true });
      expect(writes.some(w => w.includes('github-quota-deferred'))).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('uses the default sleep helper when admission waits briefly', async () => {
    const start = Date.now();
    const store = new MemoryLedgerStore();
    await store.transact('github', ledger => {
      credentialState(ledger, 'default-sleep', start).buckets.core = {
        limit: 1000,
        remaining: 0,
        resetAt: start + 30,
        observedAt: start,
      };
    });
    child.spawn.mockImplementation(() =>
      makePipeChild({
        stdout: `HTTP/2.0 200 OK\nX-Ratelimit-Limit: 1000\nX-Ratelimit-Remaining: 999\nX-Ratelimit-Reset: ${Math.floor((start + 900_000) / 1000)}\nX-Ratelimit-Resource: core\n\n{}`,
      })
    );
    const result = await runGh(['api', 'repos/o/r'], {
      store,
      credential: 'default-sleep',
      now: () => Date.now(),
      log: quiet,
      env: {},
      priority: 'merge',
      maxWaitMs: 5_000,
      // Intentionally omit sleep to exercise the default setTimeout path.
    });
    expect(result).toMatchObject({ code: 0, deferred: false });
    expect(child.spawn).toHaveBeenCalled();
  });
});
