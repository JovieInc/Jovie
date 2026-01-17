import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForSession } from '@/hooks/useSignUpFlow';

describe('waitForSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear any existing Clerk mock
    delete (window as { Clerk?: unknown }).Clerk;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete (window as { Clerk?: unknown }).Clerk;
  });

  it('returns true immediately when session is already active', async () => {
    // Setup: session is already active
    (window as { Clerk?: { session?: { status?: string } } }).Clerk = {
      session: { status: 'active' },
    };

    const result = await waitForSession(5000, 50);
    expect(result).toBe(true);
  });

  it('polls and returns true when session becomes active', async () => {
    // Setup: session starts as undefined, becomes active after some polls
    let pollCount = 0;
    Object.defineProperty(window, 'Clerk', {
      configurable: true,
      get: () => {
        pollCount++;
        // Become active after 3 polls
        if (pollCount >= 3) {
          return { session: { status: 'active' } };
        }
        return { session: { status: 'loading' } };
      },
    });

    const promise = waitForSession(5000, 50);

    // Advance timers to allow polling
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe(true);
    expect(pollCount).toBeGreaterThanOrEqual(3);
  });

  it('returns false when timeout is reached without session becoming active', async () => {
    // Setup: session never becomes active
    (window as { Clerk?: { session?: { status?: string } } }).Clerk = {
      session: { status: 'loading' },
    };

    const promise = waitForSession(100, 20);

    // Advance time past the timeout - run timer and promise concurrently
    const [result] = await Promise.all([
      promise,
      vi.advanceTimersByTimeAsync(200),
    ]);

    expect(result).toBe(false);
  });

  it('returns false when Clerk is not available', async () => {
    // Setup: no Clerk on window
    delete (window as { Clerk?: unknown }).Clerk;

    const promise = waitForSession(100, 20);

    // Advance time past the timeout
    const [result] = await Promise.all([
      promise,
      vi.advanceTimersByTimeAsync(200),
    ]);

    expect(result).toBe(false);
  });

  it('handles session being null', async () => {
    // Setup: Clerk exists but session is null
    (window as { Clerk?: { session?: null } }).Clerk = {
      session: null,
    };

    const promise = waitForSession(100, 20);

    // Advance time past the timeout
    const [result] = await Promise.all([
      promise,
      vi.advanceTimersByTimeAsync(200),
    ]);

    expect(result).toBe(false);
  });

  it('uses exponential backoff up to 200ms cap', async () => {
    // Track how many times we poll
    let pollCount = 0;

    Object.defineProperty(window, 'Clerk', {
      configurable: true,
      get: () => {
        pollCount++;
        return { session: { status: 'loading' } };
      },
    });

    const promise = waitForSession(2000, 50);

    // Advance time to allow multiple polls with backoff
    const [result] = await Promise.all([
      promise,
      vi.advanceTimersByTimeAsync(2100),
    ]);

    expect(result).toBe(false);
    // Verify polling happened multiple times (at least initial + several backoff polls)
    expect(pollCount).toBeGreaterThan(5);
  });

  it('respects custom timeout and interval parameters', async () => {
    (window as { Clerk?: { session?: { status?: string } } }).Clerk = {
      session: { status: 'loading' },
    };

    // Very short timeout
    const promise = waitForSession(50, 10);

    const [result] = await Promise.all([
      promise,
      vi.advanceTimersByTimeAsync(100),
    ]);

    expect(result).toBe(false);
  });

  it('handles session status changing from undefined to active', async () => {
    let callCount = 0;
    Object.defineProperty(window, 'Clerk', {
      configurable: true,
      get: () => {
        callCount++;
        if (callCount >= 2) {
          return { session: { status: 'active' } };
        }
        return { session: undefined };
      },
    });

    const promise = waitForSession(5000, 50);

    const [result] = await Promise.all([
      promise,
      vi.advanceTimersByTimeAsync(100),
    ]);

    expect(result).toBe(true);
  });
});
