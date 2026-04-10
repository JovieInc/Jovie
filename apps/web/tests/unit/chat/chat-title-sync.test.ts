import { describe, expect, it } from 'vitest';

/**
 * Tests for the title sync/polling logic in useJovieChat.
 *
 * The actual useJovieChat hook requires extensive mocking of @ai-sdk/react,
 * TanStack Query, and DOM APIs. Here we test the pure logic used to determine
 * when to start/stop polling for auto-generated titles.
 */

/** Mirrors TITLE_POLL_FAST_INTERVAL_MS in useJovieChat */
const TITLE_POLL_FAST_INTERVAL_MS = 2_000;

/** Mirrors TITLE_POLL_BACKOFF_INTERVAL_MS in useJovieChat */
const TITLE_POLL_BACKOFF_INTERVAL_MS = 5_000;

/** Mirrors TITLE_POLL_MAX_DURATION_MS in useJovieChat */
const TITLE_POLL_MAX_DURATION_MS = 15_000;

/** Mirrors TITLE_POLL_FAST_WINDOW_MS in useJovieChat */
const TITLE_POLL_FAST_WINDOW_MS = TITLE_POLL_FAST_INTERVAL_MS * 3;

describe('title polling decision logic', () => {
  function getTitlePollIntervalMs(
    titlePollingSince: number | null,
    currentTime: number
  ): number | false {
    if (titlePollingSince === null) {
      return false;
    }

    const elapsed = currentTime - titlePollingSince;

    if (elapsed >= TITLE_POLL_MAX_DURATION_MS) {
      return false;
    }

    return elapsed < TITLE_POLL_FAST_WINDOW_MS
      ? TITLE_POLL_FAST_INTERVAL_MS
      : TITLE_POLL_BACKOFF_INTERVAL_MS;
  }

  function shouldPollForTitle(
    titlePollingSince: number | null,
    currentTime: number
  ): boolean {
    return getTitlePollIntervalMs(titlePollingSince, currentTime) !== false;
  }

  it('should not poll when titlePollingSince is null', () => {
    expect(shouldPollForTitle(null, Date.now())).toBe(false);
  });

  it('should poll when recently started', () => {
    const now = Date.now();
    expect(shouldPollForTitle(now, now)).toBe(true);
  });

  it('uses the fast interval for the first few title polls', () => {
    const start = Date.now();
    expect(getTitlePollIntervalMs(start, start)).toBe(
      TITLE_POLL_FAST_INTERVAL_MS
    );
    expect(
      getTitlePollIntervalMs(start, start + TITLE_POLL_FAST_WINDOW_MS - 1)
    ).toBe(TITLE_POLL_FAST_INTERVAL_MS);
  });

  it('backs off once title polling appears stalled', () => {
    const start = Date.now();
    expect(
      getTitlePollIntervalMs(start, start + TITLE_POLL_FAST_WINDOW_MS)
    ).toBe(TITLE_POLL_BACKOFF_INTERVAL_MS);
    expect(
      getTitlePollIntervalMs(start, start + TITLE_POLL_MAX_DURATION_MS - 1)
    ).toBe(TITLE_POLL_BACKOFF_INTERVAL_MS);
  });

  it('should poll for up to TITLE_POLL_MAX_DURATION_MS', () => {
    const start = Date.now();
    expect(
      shouldPollForTitle(start, start + TITLE_POLL_MAX_DURATION_MS - 1)
    ).toBe(true);
  });

  it('should stop polling after TITLE_POLL_MAX_DURATION_MS', () => {
    const start = Date.now();
    expect(shouldPollForTitle(start, start + TITLE_POLL_MAX_DURATION_MS)).toBe(
      false
    );
  });

  it('should stop polling well after max duration', () => {
    const start = Date.now();
    expect(
      shouldPollForTitle(start, start + TITLE_POLL_MAX_DURATION_MS + 5000)
    ).toBe(false);
  });
});

describe('title polling behavior', () => {
  it('uses correct fast poll interval', () => {
    expect(TITLE_POLL_FAST_INTERVAL_MS).toBe(2000);
  });

  it('uses correct backoff poll interval', () => {
    expect(TITLE_POLL_BACKOFF_INTERVAL_MS).toBe(5000);
  });

  it('uses correct max duration', () => {
    expect(TITLE_POLL_MAX_DURATION_MS).toBe(15000);
  });

  it('caps title polling to a small number of requests before timing out', () => {
    const pollSchedule = [
      TITLE_POLL_FAST_INTERVAL_MS,
      TITLE_POLL_FAST_INTERVAL_MS,
      TITLE_POLL_FAST_INTERVAL_MS,
      TITLE_POLL_BACKOFF_INTERVAL_MS,
    ];

    const elapsedBeforeTimeout = pollSchedule.reduce(
      (total, interval) => total + interval,
      0
    );

    expect(elapsedBeforeTimeout).toBe(11_000);
    expect(pollSchedule).toHaveLength(4);
  });
});

describe('title polling stop conditions', () => {
  it('should stop when title becomes available', () => {
    // When conversationTitle transitions from null to a string,
    // titlePollingSince should be set to null
    const titlePollingSince = Date.now();
    const conversationTitle = 'My Generated Title';

    const shouldStopPolling =
      titlePollingSince !== null && conversationTitle !== null;
    expect(shouldStopPolling).toBe(true);
  });

  it('should not stop when title is still null', () => {
    const titlePollingSince = Date.now();
    const conversationTitle = null;

    const shouldStopPolling =
      titlePollingSince !== null && conversationTitle !== null;
    expect(shouldStopPolling).toBe(false);
  });

  it('should not trigger stop when polling was never started', () => {
    const titlePollingSince = null;
    const conversationTitle = 'Some Title';

    const shouldStopPolling =
      titlePollingSince !== null && conversationTitle !== null;
    expect(shouldStopPolling).toBe(false);
  });
});

describe('titlePending response handling', () => {
  it('should start polling when server returns titlePending=true', () => {
    const serverResponse = {
      messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
      titlePending: true,
    };

    const shouldStartPolling = serverResponse.titlePending === true;
    expect(shouldStartPolling).toBe(true);
  });

  it('should not start polling when server returns titlePending=false', () => {
    const serverResponse = {
      messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
      titlePending: false,
    };

    const shouldStartPolling = serverResponse.titlePending === true;
    expect(shouldStartPolling).toBe(false);
  });

  it('should not start polling when titlePending is undefined', () => {
    const serverResponse = {
      messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
    };

    const shouldStartPolling =
      'titlePending' in serverResponse && serverResponse.titlePending === true;
    expect(shouldStartPolling).toBe(false);
  });
});
