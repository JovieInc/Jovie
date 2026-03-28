import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { GuardSummary } from './performance-budgets-guard';
import {
  buildOvernightState,
  buildRouteQueue,
  findFreePort,
} from './performance-overnight';

const openServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    openServers.map(
      server =>
        new Promise<void>((resolvePromise, reject) => {
          server.close(error => {
            if (error) {
              reject(error);
              return;
            }

            resolvePromise();
          });
        })
    )
  );
  openServers.length = 0;
});

function createSummary(): GuardSummary {
  return {
    baseUrl: 'http://127.0.0.1:4100',
    checkedAt: '2026-03-27T00:00:00.000Z',
    pages: [
      {
        auth: false,
        configuredPath: '/',
        group: 'home',
        id: 'home',
        primaryMetric: 'interactive-shell-ready',
        rawResourceSizes: {
          font: 0,
          image: 0,
          script: 100,
          stylesheet: 20,
          total: 120,
        },
        rawTimings: {
          'cumulative-layout-shift': 0.01,
          'first-contentful-paint': 400,
          'first-input-delay': 0,
          'interactive-shell-ready': 180,
          'largest-contentful-paint': 700,
          'redirect-complete': 0,
          'skeleton-to-content': 0,
          'time-to-first-byte': 90,
          'warm-shell-response': 0,
        },
        resolvedPath: '/',
        resourceSizes: [],
        routeSurface: 'homepage',
        samples: [],
        timings: [
          {
            budget: 100,
            measured: 180,
            name: 'interactive-shell-ready',
            overshootPct: 80,
            passed: false,
            unit: 'ms',
          },
        ],
        url: 'http://127.0.0.1:4100/',
        violations: [
          {
            budget: 100,
            kind: 'timing',
            measured: 180,
            name: 'interactive-shell-ready',
            overshootPct: 80,
            passed: false,
            unit: 'ms',
          },
        ],
      },
      {
        auth: true,
        configuredPath: '/app/dashboard/releases',
        group: 'creator-shell',
        id: 'creator-releases',
        primaryMetric: 'warm-shell-response',
        rawResourceSizes: {
          font: 0,
          image: 0,
          script: 500,
          stylesheet: 40,
          total: 540,
        },
        rawTimings: {
          'cumulative-layout-shift': 0.01,
          'first-contentful-paint': 600,
          'first-input-delay': 0,
          'interactive-shell-ready': 0,
          'largest-contentful-paint': 900,
          'redirect-complete': 0,
          'skeleton-to-content': 120,
          'time-to-first-byte': 120,
          'warm-shell-response': 130,
        },
        resolvedPath: '/app/dashboard/releases',
        resourceSizes: [],
        routeSurface: 'creator-app',
        samples: [],
        timings: [
          {
            budget: 100,
            measured: 130,
            name: 'warm-shell-response',
            overshootPct: 30,
            passed: false,
            unit: 'ms',
          },
        ],
        url: 'http://127.0.0.1:4100/app/dashboard/releases',
        violations: [
          {
            budget: 100,
            kind: 'timing',
            measured: 130,
            name: 'warm-shell-response',
            overshootPct: 30,
            passed: false,
            unit: 'ms',
          },
        ],
      },
      {
        auth: false,
        configuredPath: '/tim',
        group: 'public-profile-core',
        id: 'public-profile-main',
        primaryMetric: 'first-contentful-paint',
        rawResourceSizes: {
          font: 0,
          image: 0,
          script: 300,
          stylesheet: 30,
          total: 330,
        },
        rawTimings: {
          'cumulative-layout-shift': 0.01,
          'first-contentful-paint': 500,
          'first-input-delay': 0,
          'interactive-shell-ready': 0,
          'largest-contentful-paint': 800,
          'redirect-complete': 0,
          'skeleton-to-content': 0,
          'time-to-first-byte': 110,
          'warm-shell-response': 0,
        },
        resolvedPath: '/tim',
        resourceSizes: [],
        routeSurface: 'public-profile',
        samples: [],
        timings: [
          {
            budget: 3000,
            measured: 500,
            name: 'first-contentful-paint',
            overshootPct: 0,
            passed: true,
            unit: 'ms',
          },
        ],
        url: 'http://127.0.0.1:4100/tim',
        violations: [],
      },
    ],
    status: 'fail',
    violationCount: 2,
  };
}

describe('performance overnight controller helpers', () => {
  it('ranks failing routes by workflow group priority, then overshoot, then id', () => {
    const queue = buildRouteQueue(createSummary());

    expect(queue.map(entry => entry.id)).toEqual(['home', 'creator-releases']);
  });

  it('builds resumable overnight state from the latest measurement', () => {
    const state = buildOvernightState({
      artifactDir: '/tmp/perf-run',
      attempts: 2,
      authStatePath: '/tmp/auth.json',
      buildPort: 4100,
      previousState: undefined,
      summary: createSummary(),
      summaryArtifactPath: '/tmp/perf-run/measurements/attempt-002.json',
    });

    expect(state.currentRoute).toBe('home');
    expect(state.completedRoutes).toEqual(['public-profile-main']);
    expect(state.failingRoutes).toEqual(['home', 'creator-releases']);
    expect(state.lastMeasurement?.artifactPath).toContain('attempt-002.json');
  });

  it('allocates a free port that can immediately be rebound by the server', async () => {
    const port = await findFreePort();
    const server = createServer();
    openServers.push(server);

    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolvePromise());
    });

    expect(port).toBeGreaterThan(0);
  });
});
