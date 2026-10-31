import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  add: vi.fn(),
  flush: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({ getClient: mocks.client }));
vi.mock('@/lib/sentry/client-full', () => ({
  addReplayIntegration: mocks.add,
}));

const ID = 'a'.repeat(32);
let replay: typeof import('@/lib/sentry/replay-start');
let cleanupListeners: () => void;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0', webdriver: false });
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.fetch.mockImplementation(
    async () => new Response(JSON.stringify({ canFlush: true }))
  );
  mocks.flush.mockResolvedValue(undefined);
  mocks.client.mockReturnValue({
    getIntegrationByName: () => ({ getReplayId: () => ID, flush: mocks.flush }),
  });
  const documentEvents = vi.spyOn(document, 'addEventListener');
  const windowEvents = vi.spyOn(globalThis, 'addEventListener');
  cleanupListeners = () => {
    for (const [event, listener, options] of documentEvents.mock.calls)
      document.removeEventListener(event, listener, options);
    for (const [event, listener, options] of windowEvents.mock.calls)
      globalThis.removeEventListener(event, listener, options);
  };
  replay = await import('@/lib/sentry/replay-start');
});
afterEach(() => {
  cleanupListeners();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buffered funnel replay', () => {
  it.each([
    ['/claim', 'claim_idle'],
    ['/start', 'onboarding_stalled'],
  ])('buffers %s until budget allows an idle flush', async (path, trigger) => {
    await replay.startFunnelReplay(path);
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(0, true);
    replay.flushReplay('client_error');
    expect(mocks.flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(replay.REPLAY_IDLE_MS);
    expect(mocks.flush).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      '/api/onboarding/replay',
      expect.objectContaining({
        body: JSON.stringify({ replayId: ID, trigger }),
        keepalive: true,
      })
    );
    replay.flushReplay('client_error');
    expect(mocks.flush).toHaveBeenCalledTimes(1);
  });

  it('keeps the buffer unsent when the server denies budget', async () => {
    mocks.fetch.mockImplementation(
      async () => new Response(JSON.stringify({ canFlush: false }))
    );
    replay.scheduleReplayLink('/start');
    await vi.advanceTimersByTimeAsync(3000);
    globalThis.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(replay.REPLAY_IDLE_MS);
    expect(mocks.flush).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('flushes once for a server-observed signup despite later client errors', async () => {
    mocks.fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify({ canFlush: true, flush: 'signup' }))
    );
    replay.scheduleReplayLink('/start');
    replay.scheduleReplayLink('/start');
    await vi.advanceTimersByTimeAsync(3000);
    globalThis.dispatchEvent(new Event('unhandledrejection'));
    expect(mocks.flush).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenLastCalledWith(
      '/api/onboarding/replay',
      expect.objectContaining({
        body: JSON.stringify({ replayId: ID, trigger: 'signup' }),
      })
    );
  });

  it('does not load replay for public profiles or automated browsers', async () => {
    await replay.startFunnelReplay('/artist-name');
    vi.stubGlobal('navigator', { userAgent: 'Googlebot', webdriver: false });
    await replay.startFunnelReplay('/start');
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
