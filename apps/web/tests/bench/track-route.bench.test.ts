import { performance } from 'node:perf_hooks';
import type { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { LinkType } from '@/types/db';

const PERF_LATENCY_ENABLED = process.env.PERF_LATENCY === 'true';
const BENCH_SAMPLE_SIZE = 10;

const DEFAULT_MEMBER = {
  id: 'aud-1',
  visits: 1,
  engagementScore: 2,
  latestActions: [],
  geoCity: null as string | null,
  geoCountry: null as string | null,
  deviceType: 'desktop' as const,
  spotifyConnected: false,
};

type BenchmarkState = {
  audienceMember: typeof DEFAULT_MEMBER | null;
  clickEvents: Array<{ id: string; linkType: LinkType }>;
  socialUpdates: number;
  delays: {
    profileSelect: number;
    audienceSelect: number;
    audienceInsert: number;
    audienceUpdate: number;
    clickInsert: number;
    socialUpdate: number;
  };
};

/**
 * Bench-only latency. Enable with PERF_LATENCY=true to profile realistic delays.
 */
function sleep(ms: number) {
  if (!PERF_LATENCY_ENABLED) {
    return Promise.resolve();
  }

  return new Promise(resolve => setTimeout(resolve, ms));
}

function createHeaders() {
  const map = new Map<string, string>();
  return {
    get: (key: string) => map.get(key.toLowerCase()) ?? null,
    set: (key: string, value: string) => {
      map.set(key.toLowerCase(), value);
    },
  } as Headers;
}

function buildDb(state: BenchmarkState) {
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            await sleep(state.delays.profileSelect);
            return [{ id: 'creator-1' }];
          },
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: async () => {
          state.socialUpdates += 1;
          await sleep(state.delays.socialUpdate);
          return [];
        },
      }),
    })),
  };
}

function buildTx(state: BenchmarkState) {
  const buildReturning = async (isConflictPath: boolean) => {
    const isClickEvent = !isConflictPath;
    const isAudience = isConflictPath;

    await sleep(
      isClickEvent ? state.delays.clickInsert : state.delays.audienceInsert
    );

    if (isClickEvent) {
      const eventId = `click-${state.clickEvents.length + 1}`;
      state.clickEvents.push({ id: eventId, linkType: 'social' });
      return [{ id: eventId }];
    }
    if (isAudience) {
      if (state.audienceMember) return [];
      state.audienceMember = { ...DEFAULT_MEMBER };
      return [state.audienceMember];
    }

    return [];
  };

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            await sleep(state.delays.audienceSelect);
            return state.audienceMember ? [state.audienceMember] : [];
          },
        }),
      }),
    }),
    insert: () => {
      let conflictPath = false;
      return {
        values: () => ({
          onConflictDoNothing: () => {
            conflictPath = true;
            return { returning: () => buildReturning(conflictPath) };
          },
          returning: () => buildReturning(conflictPath),
        }),
      };
    },
    update: () => ({
      set: () => ({
        where: async () => {
          await sleep(state.delays.audienceUpdate);
          return [];
        },
      }),
    }),
  };
}

async function runBenchmark(sampleSize: number) {
  const state: BenchmarkState = {
    audienceMember: { ...DEFAULT_MEMBER },
    clickEvents: [],
    socialUpdates: 0,
    delays: {
      profileSelect: 2,
      audienceSelect: 2,
      audienceInsert: 3,
      audienceUpdate: 4,
      clickInsert: 3,
      socialUpdate: 8,
    },
  };

  vi.resetModules();

  vi.doMock('@/lib/ingestion/session', () => ({
    withSystemIngestionSession: async (
      cb: (tx: ReturnType<typeof buildTx>) => Promise<unknown>
    ) => cb(buildTx(state)),
  }));

  vi.doMock('@/lib/db', () => ({
    db: buildDb(state),
  }));

  vi.doMock('@/lib/rate-limit', () => ({
    trackingIpClicksLimiter: {
      limit: async () => ({ success: true }),
    },
    createRateLimitHeaders: () => ({}),
  }));

  const { POST } = await import('@/app/api/track/route');

  const durations: number[] = [];
  for (let i = 0; i < sampleSize; i += 1) {
    const headers = createHeaders();
    const request: Partial<NextRequest> = {
      json: async () => ({
        handle: 'test-user',
        linkType: 'social' as LinkType,
        target: 'https://example.com',
        linkId: 'social-1',
      }),
      headers,
    };

    const start = performance.now();
    const response = await POST(request as NextRequest);
    const duration = performance.now() - start;
    expect(response.ok).toBe(true);
    durations.push(duration);
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  return {
    p50,
    p95,
    clicks: state.clickEvents.length,
    socialUpdates: state.socialUpdates,
    durations,
  };
}

describe('track route synthetic benchmark', () => {
  it('captures p50/p95 latency and ensures click persistence', async () => {
    const result = await runBenchmark(BENCH_SAMPLE_SIZE);

    expect(result.clicks).toBe(BENCH_SAMPLE_SIZE);
    expect(result.socialUpdates).toBeGreaterThan(0);
    // Log for manual comparison before/after perf changes
    console.info('[track-route-benchmark]', {
      p50: Math.round(result.p50),
      p95: Math.round(result.p95),
      clicks: result.clicks,
      socialUpdates: result.socialUpdates,
    });
  }, 40000);
});
