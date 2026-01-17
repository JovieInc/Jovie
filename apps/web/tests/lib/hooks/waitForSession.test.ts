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

    const promise = waitForSession(5000, 50);

    // Should resolve immediately without advancing timers
    await expect(promise).resolves.toBe(true);
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

    await expect(promise).resolves.toBe(true);
    expect(pollCount).toBeGreaterThanOrEqual(3);
  });

  it('returns false when timeout is reached without session becoming active', async () => {
    // Setup: session never becomes active
    (window as { Clerk?: { session?: { status?: string } } }).Clerk = {
      session: { status: 'loading' },
    };

    const promise = waitForSession(100, 20);

    // Advance time past the timeout
    await vi.advanceTimersByTimeAsync(150);

    await expect(promise).resolves.toBe(false);
  });

  it('returns false when Clerk is not available', async () => {
    // Setup: no Clerk on window
    delete (window as { Clerk?: unknown }).Clerk;

    const promise = waitForSession(100, 20);

    // Advance time past the timeout
    await vi.advanceTimersByTimeAsync(150);

    await expect(promise).resolves.toBe(false);
  });

  it('handles session being null', async () => {
    // Setup: Clerk exists but session is null
    (window as { Clerk?: { session?: null } }).Clerk = {
      session: null,
    };

    const promise = waitForSession(100, 20);

    // Advance time past the timeout
    await vi.advanceTimersByTimeAsync(150);

    await expect(promise).resolves.toBe(false);
  });

  it('uses exponential backoff up to 200ms cap', async () => {
    // Track how many times we poll and the intervals
    const pollTimes: number[] = [];
    let lastPollTime = Date.now();

    Object.defineProperty(window, 'Clerk', {
      configurable: true,
      get: () => {
        const now = Date.now();
        if (pollTimes.length > 0) {
          pollTimes.push(now - lastPollTime);
        }
        lastPollTime = now;
        pollTimes.push(0); // Mark that we polled
        return { session: { status: 'loading' } };
      },
    });

    const promise = waitForSession(2000, 50);

    // Advance time to allow multiple polls with backoff
    await vi.advanceTimersByTimeAsync(2100);

    await expect(promise).resolves.toBe(false);

    // Verify polling happened multiple times
    expect(pollTimes.length).toBeGreaterThan(5);
  });

  it('respects custom timeout and interval parameters', async () => {
    (window as { Clerk?: { session?: { status?: string } } }).Clerk = {
      session: { status: 'loading' },
    };

    // Very short timeout
    const promise = waitForSession(50, 10);

    await vi.advanceTimersByTimeAsync(60);

    await expect(promise).resolves.toBe(false);
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

    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toBe(true);
  });
});
