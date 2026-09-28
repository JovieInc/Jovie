import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Mac door and the Delivery card share one configured merges reader, so
 * repeated snapshots reuse its cache and honor its GitHub rate-limit backoff.
 */
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_GITHUB_TOKEN: 'hud-token',
    HUD_GITHUB_OWNER: 'JovieInc',
    HUD_GITHUB_REPO: 'Jovie',
  },
}));

const COUNTS = {
  org: { issueCount: 292 },
  jovie: { issueCount: 189 },
  lyb: { issueCount: 17 },
  summer: { issueCount: 26 },
  last7: { issueCount: 862 },
  prior7: { issueCount: 225 },
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

async function loadReader() {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  const { readConfiguredMerges } = await import(
    '@/lib/ovie/shipping-state/configured.server'
  );
  return readConfiguredMerges;
}

describe('configured merges reader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T02:00:00.000Z'));
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('serves repeated snapshots from one GitHub request inside the TTL', async () => {
    fetchMock.mockImplementation(async () => json({ data: COUNTS }));
    const readConfiguredMerges = await loadReader();

    const first = await readConfiguredMerges();
    const second = await readConfiguredMerges();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.delivery?.merges?.today).toEqual({
      state: 'measured-nonzero',
      value: 292,
    });

    vi.advanceTimersByTime(60_000);
    await readConfiguredMerges();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors the GitHub rate-limit backoff across snapshots', async () => {
    fetchMock.mockImplementation(async () =>
      json({}, 429, { 'retry-after': '120' })
    );
    const readConfiguredMerges = await loadReader();

    const limited = await readConfiguredMerges();
    expect(limited.errorCode).toBe('rate-limited');

    // Past the short failure cache, but inside the 120s backoff: no request.
    vi.advanceTimersByTime(10_000);
    const stillLimited = await readConfiguredMerges();
    expect(stillLimited.errorCode).toBe('rate-limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
