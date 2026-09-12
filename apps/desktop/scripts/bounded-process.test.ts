import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import {
  runBoundedProcess,
  type BoundedProcessSpawn,
} from '../src/bounded-process.ts';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  exitCode: number | null = null;
  unref = vi.fn();
  kill = vi.fn((signal?: NodeJS.Signals) => {
    this.killed = true;
    this.exitCode = signal === 'SIGKILL' ? null : this.exitCode;
    return true;
  });
}

test('missing executable is a structured spawn failure, never ok', async () => {
  const result = await runBoundedProcess({
    command: '__jovie_missing_bin_6183__',
    args: [],
    timeoutMs: 500,
    waitForExit: false,
  });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected failure');
  expect(result.reason).toBe('missing-executable');
  expect(result.completed).toBe(false);
});

test('spawn success is distinct from command completion', async () => {
  const child = new FakeChild();
  const spawnImpl: BoundedProcessSpawn = () => child as never;
  const pending = runBoundedProcess({
    command: 'osascript',
    args: ['-e', 'tell application "Terminal" to do script "ssh -t gem"'],
    timeoutMs: 1_000,
    detached: true,
    stdio: 'ignore',
    waitForExit: false,
    spawnImpl,
  });

  child.emit('spawn');
  const result = await pending;

  expect(result).toEqual({
    ok: true,
    spawned: true,
    completed: false,
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
  });
  expect(child.unref).toHaveBeenCalledTimes(1);
  expect(child.kill).not.toHaveBeenCalled();
});

test('waitForExit records completion and bounds captured output', async () => {
  const child = new FakeChild();
  const pending = runBoundedProcess({
    command: 'echo',
    args: ['hello'],
    timeoutMs: 1_000,
    maxOutputBytes: 8,
    waitForExit: true,
    spawnImpl: () => child as never,
  });

  child.emit('spawn');
  child.stdout.emit('data', 'abcdefghijklmnop');
  child.stderr.emit('data', 'ERRRRRRRR');
  child.emit('close', 0, null);
  const result = await pending;

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected success');
  expect(result.completed).toBe(true);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe('abcdefgh');
  expect(result.stderr).toBe('ERRRRRRR');
});

test('timeout kills owned work and does not report success', async () => {
  const child = new FakeChild();
  const pending = runBoundedProcess({
    command: 'sleep',
    args: ['30'],
    timeoutMs: 20,
    waitForExit: true,
    spawnImpl: () => child as never,
  });

  child.emit('spawn');
  const result = await pending;

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected timeout');
  expect(result.reason).toBe('timeout');
  expect(result.spawned).toBe(true);
  expect(child.kill).toHaveBeenCalled();
});

test('error listener maps spawn failures after the call returns a child', async () => {
  const child = new FakeChild();
  const pending = runBoundedProcess({
    command: 'x-terminal-emulator',
    args: ['-e', 'bash'],
    timeoutMs: 500,
    waitForExit: false,
    spawnImpl: () => child as never,
  });

  const error = Object.assign(new Error('spawn x-terminal-emulator ENOENT'), {
    code: 'ENOENT',
  });
  child.emit('error', error);
  const result = await pending;

  expect(result).toMatchObject({
    ok: false,
    reason: 'missing-executable',
    spawned: false,
    completed: false,
  });
});
