import { describe, expect, it } from 'vitest';
import {
  HOSTED_LAUNCH_PRECONNECT_SOCKETS,
  loadHostedUrlAfterSplash,
  preconnectHostedOrigin,
  primeHostedLaunch,
  primeHostedLaunchCache,
} from '../src/hosted-launch-prime';

describe('hosted-launch-prime', () => {
  it('preconnectHostedOrigin opens the configured socket budget', () => {
    const calls: Array<{ url: string; numSockets: number }> = [];
    preconnectHostedOrigin({
      origin: 'https://staging.jov.ie',
      preconnect: options => calls.push(options),
    });
    expect(calls).toEqual([
      {
        url: 'https://staging.jov.ie',
        numSockets: HOSTED_LAUNCH_PRECONNECT_SOCKETS,
      },
    ]);
  });

  it('primeHostedLaunchCache warms build-info and the entry URL without credentials', async () => {
    const urls: string[] = [];
    const inits: unknown[] = [];
    primeHostedLaunchCache({
      origin: 'https://staging.jov.ie',
      entryUrl: 'https://staging.jov.ie/app/chat',
      fetch: async (url, init) => {
        urls.push(url);
        inits.push(init);
        return { ok: true };
      },
    });
    await Promise.resolve();
    expect(urls).toEqual([
      'https://staging.jov.ie/api/health/build-info',
      'https://staging.jov.ie/app/chat',
    ]);
    expect(inits).toEqual([
      { cache: 'force-cache', redirect: 'follow' },
      { cache: 'force-cache', redirect: 'follow' },
    ]);
  });

  it('primeHostedLaunch combines preconnect and cache warm and swallows fetch errors', async () => {
    const calls: string[] = [];
    primeHostedLaunch({
      origin: 'https://app.jov.ie',
      entryUrl: 'https://app.jov.ie/app/chat',
      preconnect: () => calls.push('preconnect'),
      fetch: async () => {
        calls.push('fetch');
        throw new Error('offline');
      },
    });
    await Promise.resolve();
    expect(calls[0]).toBe('preconnect');
    expect(calls.filter(c => c === 'fetch')).toHaveLength(2);
  });

  it('loadHostedUrlAfterSplash warms cache and navigates on dom-ready', () => {
    const events: Array<[string, () => void]> = [];
    const loads: string[] = [];
    const fetches: string[] = [];
    const win = {
      isDestroyed: () => false,
      webContents: {
        getURL: () => '',
        once: (event: 'dom-ready', listener: () => void) => {
          events.push([event, listener]);
        },
      },
      loadURL: (url: string) => {
        loads.push(url);
      },
    };
    loadHostedUrlAfterSplash({
      win,
      hostedUrl: 'https://staging.jov.ie/app/chat',
      origin: 'https://staging.jov.ie',
      entryUrl: 'https://staging.jov.ie/app/chat',
      splashUrl: 'data:text/html,splash',
      fetch: async url => {
        fetches.push(url);
        return { ok: true };
      },
    });
    expect(loads).toEqual(['data:text/html,splash']);
    expect(events.map(([event]) => event)).toEqual(['dom-ready']);
    events[0]![1]();
    expect(loads).toEqual([
      'data:text/html,splash',
      'https://staging.jov.ie/app/chat',
    ]);
    expect(fetches).toContain('https://staging.jov.ie/app/chat');
  });
});
