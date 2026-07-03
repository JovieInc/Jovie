import { describe, expect, it } from 'vitest';
import {
  isSpawnResourceUnavailable,
  SpawnEagainTracker,
  SpawnResourceUnavailableError,
} from '../../hermes/lib/spawn-resource.ts';

describe('spawn resource helpers', () => {
  it('detects EAGAIN from message and errno code', () => {
    expect(
      isSpawnResourceUnavailable(new Error('spawnSync gh EAGAIN'))
    ).toBe(true);
    expect(
      isSpawnResourceUnavailable(
        Object.assign(new Error('spawn failed'), { code: 'EAGAIN' })
      )
    ).toBe(true);
    expect(
      isSpawnResourceUnavailable(
        Object.assign(new Error('busy'), { code: 'EBUSY' })
      )
    ).toBe(true);
    expect(isSpawnResourceUnavailable(new Error('command not found'))).toBe(
      false
    );
  });

  it('formats SpawnResourceUnavailableError with the command name', () => {
    const err = new SpawnResourceUnavailableError(
      'gh',
      new Error('spawnSync gh EAGAIN')
    );
    expect(err.command).toBe('gh');
    expect(err.message).toContain('spawnSync gh EAGAIN');
  });

  it('backs off after consecutive spawn-pressure failures', async () => {
    const sleeps = [];
    const tracker = new SpawnEagainTracker({
      threshold: 3,
      backoffMs: 60_000,
      sleep: async ms => {
        sleeps.push(ms);
      },
    });

    expect(tracker.record('gh')).toBe(1);
    expect(tracker.record('gh')).toBe(2);
    expect(await tracker.maybeBackoff()).toBe(false);

    expect(tracker.record('gh')).toBe(3);
    expect(await tracker.maybeBackoff()).toBe(true);
    expect(sleeps).toEqual([60_000]);
    expect(tracker.consecutiveCount).toBe(0);
  });

  it('resets consecutive failures after a successful spawn', () => {
    const tracker = new SpawnEagainTracker({ threshold: 3 });
    tracker.record('gh');
    tracker.record('gh');
    tracker.reset();
    expect(tracker.consecutiveCount).toBe(0);
    expect(tracker.record('gh')).toBe(1);
  });
});