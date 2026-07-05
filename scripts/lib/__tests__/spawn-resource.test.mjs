import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SPAWN_EAGAIN_BACKOFF_MS,
  DEFAULT_SPAWN_EAGAIN_THRESHOLD,
  isSpawnResourceUnavailable,
  SpawnResourceGuard,
  SpawnResourceUnavailableError,
} from '../../hermes/lib/spawn-resource.ts';

describe('spawn resource helpers', () => {
  it('detects EAGAIN spawn failures by errno and message', () => {
    expect(
      isSpawnResourceUnavailable(
        Object.assign(new Error('spawnSync gh EAGAIN'), { code: 'EAGAIN' })
      )
    ).toBe(true);
    expect(isSpawnResourceUnavailable(new Error('spawnSync gh EAGAIN'))).toBe(
      true
    );
    expect(
      isSpawnResourceUnavailable(
        Object.assign(new Error('too many open files'), { code: 'EMFILE' })
      )
    ).toBe(true);
    expect(isSpawnResourceUnavailable(new Error('command not found'))).toBe(
      false
    );
  });

  it('wraps spawn resource failures with command context', () => {
    const cause = Object.assign(new Error('spawnSync gh EAGAIN'), {
      code: 'EAGAIN',
    });
    const err = new SpawnResourceUnavailableError('gh', cause);
    expect(err.command).toBe('gh');
    expect(err.message).toContain('gh');
    expect(err.message).toContain('EAGAIN');
  });

  it('logs gh_eagain_skip and backs off after consecutive failures', async () => {
    vi.useFakeTimers();
    const events = [];
    const guard = new SpawnResourceGuard({
      threshold: 2,
      backoffMs: 1_000,
      onEvent: entry => events.push(entry),
    });

    guard.recordFailure('gh', new Error('spawnSync gh EAGAIN'));
    expect(events.at(-1)).toMatchObject({
      event: 'gh_eagain_skip',
      command: 'gh',
      consecutive: 1,
    });

    guard.recordFailure('gh', new Error('spawnSync gh EAGAIN'));
    const backoff = guard.maybeBackoff();
    await vi.advanceTimersByTimeAsync(1_000);
    await backoff;

    expect(events.at(-1)).toMatchObject({
      event: 'gh_eagain_backoff',
      consecutive: 2,
      backoffMs: 1_000,
    });
    expect(guard.consecutiveFailures).toBe(0);
    vi.useRealTimers();
  });

  it('resets the consecutive counter after a successful spawn', () => {
    const guard = new SpawnResourceGuard({
      threshold: DEFAULT_SPAWN_EAGAIN_THRESHOLD,
      backoffMs: DEFAULT_SPAWN_EAGAIN_BACKOFF_MS,
    });
    guard.recordFailure('gh', new Error('spawnSync gh EAGAIN'));
    guard.recordFailure('gh', new Error('spawnSync gh EAGAIN'));
    guard.recordSuccess();
    expect(guard.consecutiveFailures).toBe(0);
  });
});
