import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  after: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: hoisted.after,
}));

const { isAfterUnavailableError, scheduleAfter } = await import(
  './schedule-after'
);

describe('isAfterUnavailableError', () => {
  it('matches the documented after() request-scope error', () => {
    expect(
      isAfterUnavailableError(
        new Error('`after()` was called outside a request scope.')
      )
    ).toBe(true);
  });

  it('matches the JOV-5605 Vercel IPC socket refusal', () => {
    expect(
      isAfterUnavailableError(
        new Error('connect ECONNREFUSED /opt/vercel/ipc.sock')
      )
    ).toBe(true);
  });

  it('matches a Node ErrnoException with ECONNREFUSED + ipc.sock', () => {
    const error = new Error(
      'connect ECONNREFUSED /tmp/vercel-ipc.sock'
    ) as Error & {
      code: string;
    };
    error.code = 'ECONNREFUSED';
    expect(isAfterUnavailableError(error)).toBe(true);
  });

  it('does not match unrelated connection failures', () => {
    expect(
      isAfterUnavailableError(new Error('connect ECONNREFUSED 127.0.0.1:5432'))
    ).toBe(false);
    expect(isAfterUnavailableError(new Error('Unauthorized'))).toBe(false);
  });
});

describe('scheduleAfter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.after.mockImplementation((task: () => void) => {
      task();
    });
  });

  it('registers with after() inside a request scope', () => {
    const task = vi.fn();
    expect(scheduleAfter(task)).toBe(true);
    expect(hoisted.after).toHaveBeenCalledWith(task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('falls back to a microtask when after() hits the Vercel IPC socket (JOV-5605)', async () => {
    const task = vi.fn();
    hoisted.after.mockImplementation(() => {
      throw new Error('connect ECONNREFUSED /opt/vercel/ipc.sock');
    });

    expect(scheduleAfter(task)).toBe(false);
    expect(task).not.toHaveBeenCalled();
    await new Promise<void>(resolve => queueMicrotask(resolve));
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('skips work when fallback is skip', () => {
    const task = vi.fn();
    hoisted.after.mockImplementation(() => {
      throw new Error('after() was called outside a request scope');
    });

    expect(scheduleAfter(task, { fallback: 'skip' })).toBe(false);
    expect(task).not.toHaveBeenCalled();
  });

  it('runs inline when fallback is inline', () => {
    const task = vi.fn();
    hoisted.after.mockImplementation(() => {
      throw new Error('connect ECONNREFUSED /opt/vercel/ipc.sock');
    });

    expect(scheduleAfter(task, { fallback: 'inline' })).toBe(false);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('rethrows unexpected after() failures', () => {
    hoisted.after.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => scheduleAfter(() => undefined)).toThrow('boom');
  });
});
