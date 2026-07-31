import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSingleRouteConfig,
  collectProductionRoutes,
  loadProductionCollectPlan,
} from '../../lighthouse-production-collect.mjs';

const tempDirs = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'lhci-prod-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { force: true, recursive: true });
  }
});

function baseConfig(
  urls = [
    'https://jovie-abc-jovie.vercel.app/',
    'https://jovie-abc-jovie.vercel.app/tim',
  ]
) {
  return {
    ci: {
      collect: {
        numberOfRuns: 3,
        url: urls,
        puppeteerScript: 'scripts/lighthouse-vercel-bypass.cjs',
        settings: { disableStorageReset: true },
      },
      assert: {
        includePassedAssertions: true,
        assertMatrix: urls.map(url => ({
          matchingUrlPattern: `^${url.replaceAll('.', '\\.')}$`,
          assertions: {
            'categories:accessibility': ['error', { minScore: 0.9 }],
          },
        })),
      },
    },
  };
}

describe('production Lighthouse per-route collect', () => {
  it('loads the production route/run plan from the exact config', () => {
    const plan = loadProductionCollectPlan(baseConfig());
    expect(plan.numberOfRuns).toBe(3);
    expect(plan.urls).toHaveLength(2);
  });

  it('narrows a multi-route config to one URL without dropping numberOfRuns', () => {
    const single = buildSingleRouteConfig(
      baseConfig(),
      'https://jovie-abc-jovie.vercel.app/tim'
    );
    expect(single.ci.collect.url).toEqual([
      'https://jovie-abc-jovie.vercel.app/tim',
    ]);
    expect(single.ci.collect.numberOfRuns).toBe(3);
  });

  it('collects routes independently and merges the sealed report set', async () => {
    const root = makeTempDir();
    const configPath = join(root, 'config.json');
    const reportsDir = join(root, '.lighthouseci');
    writeFileSync(configPath, JSON.stringify(baseConfig()));

    const executeRouteAttempt = vi.fn(async ({ url, numberOfRuns }) => {
      const files = [];
      for (let i = 0; i < numberOfRuns; i += 1) {
        const path = join(root, `report-${encodeURIComponent(url)}-${i}.json`);
        writeFileSync(
          path,
          JSON.stringify({ requestedUrl: url, finalUrl: url, run: i })
        );
        files.push(path);
      }
      return { code: 0, output: '', reportFiles: files };
    });

    const result = await collectProductionRoutes({
      configPath,
      reportsDir,
      executeRouteAttempt,
      deadlineMs: Date.now() + 60 * 60_000,
      estimatedRunMs: 1_000,
      overheadMs: 0,
      maxAttempts: 3,
      cooldownMs: 0,
      report: vi.fn(),
    });

    expect(result.code).toBe(0);
    expect(result.reportCount).toBe(6);
    expect(executeRouteAttempt).toHaveBeenCalledTimes(2);
    expect(readFileSync(join(reportsDir, 'lhr-0.json'), 'utf8')).toContain(
      'jovie-abc-jovie.vercel.app/'
    );
    expect(readFileSync(join(reportsDir, 'lhr-5.json'), 'utf8')).toContain(
      '/tim'
    );
  });

  it('retries only the failed route and keeps completed route evidence', async () => {
    const root = makeTempDir();
    const configPath = join(root, 'config.json');
    const reportsDir = join(root, '.lighthouseci');
    writeFileSync(configPath, JSON.stringify(baseConfig()));

    let timAttempts = 0;
    const executeRouteAttempt = vi.fn(async ({ url, numberOfRuns }) => {
      if (url.endsWith('/tim')) {
        timAttempts += 1;
        if (timAttempts === 1) {
          return { code: 1, output: 'PROTOCOL_TIMEOUT: DOMSnapshot.disable' };
        }
      }
      const files = Array.from({ length: numberOfRuns }, (_, i) => {
        const path = join(root, `ok-${encodeURIComponent(url)}-${i}.json`);
        writeFileSync(
          path,
          JSON.stringify({ requestedUrl: url, finalUrl: url })
        );
        return path;
      });
      return { code: 0, output: '', reportFiles: files };
    });

    const result = await collectProductionRoutes({
      configPath,
      reportsDir,
      executeRouteAttempt,
      deadlineMs: Date.now() + 60 * 60_000,
      estimatedRunMs: 1_000,
      overheadMs: 0,
      maxAttempts: 3,
      cooldownMs: 0,
      report: vi.fn(),
    });

    expect(result.code).toBe(0);
    expect(timAttempts).toBe(2);
    // home once + /tim twice
    expect(executeRouteAttempt).toHaveBeenCalledTimes(3);
    expect(result.reportCount).toBe(6);
  });

  it('fails closed with job_deadline when a late transient failure leaves no room for another route attempt', async () => {
    const root = makeTempDir();
    const configPath = join(root, 'config.json');
    const reportsDir = join(root, '.lighthouseci');
    writeFileSync(configPath, JSON.stringify(baseConfig()));

    // 20-minute job. First route burns 12 minutes on a protocol timeout, then
    // a successful retry burns 6 minutes. Second route needs 3*2min+overhead
    // and must refuse rather than start a partial collect into the cancel.
    let nowMs = 0;
    const executeRouteAttempt = vi.fn(async ({ url, numberOfRuns }) => {
      if (url.endsWith('/')) {
        if (
          executeRouteAttempt.mock.calls.filter(c => c[0].url.endsWith('/'))
            .length === 1
        ) {
          nowMs += 720_000;
          return { code: 1, output: 'PROTOCOL_TIMEOUT' };
        }
        nowMs += 360_000;
        const files = Array.from({ length: numberOfRuns }, (_, i) => {
          const path = join(root, `home-${i}.json`);
          writeFileSync(
            path,
            JSON.stringify({ requestedUrl: url, finalUrl: url })
          );
          return path;
        });
        return { code: 0, output: '', reportFiles: files };
      }
      throw new Error('second route must not start');
    });

    const result = await collectProductionRoutes({
      configPath,
      reportsDir,
      executeRouteAttempt,
      deadlineMs: 1_200_000,
      estimatedRunMs: 120_000,
      overheadMs: 30_000,
      maxAttempts: 3,
      cooldownMs: 10_000,
      now: () => nowMs,
      sleep: async ms => {
        nowMs += ms;
      },
      report: vi.fn(),
    });

    expect(result.code).toBe(1);
    expect(result.failureClass).toBe('job_deadline');
    expect(result.completedRoutes).toBe(1);
    expect(result.requiredRoutes).toBe(2);
    expect(result.output).toContain('LIGHTHOUSE_FAILURE_CLASS=job_deadline');
    expect(result.output).toContain('LIGHTHOUSE_ROUTE=/tim');
    expect(
      executeRouteAttempt.mock.calls.every(c => c[0].url.endsWith('/'))
    ).toBe(true);
  });

  it('fails closed when a successful collect returns fewer than numberOfRuns reports', async () => {
    const root = makeTempDir();
    const configPath = join(root, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify(baseConfig(['https://jovie-abc-jovie.vercel.app/']))
    );

    const result = await collectProductionRoutes({
      configPath,
      reportsDir: join(root, '.lighthouseci'),
      executeRouteAttempt: async () => ({
        code: 0,
        output: '',
        reportFiles: [join(root, 'only-one.json')].map(path => {
          writeFileSync(path, '{}');
          return path;
        }),
      }),
      estimatedRunMs: 1_000,
      overheadMs: 0,
      report: vi.fn(),
    });

    expect(result.code).toBe(1);
    expect(result.failureClass).toBe('unknown');
    expect(result.output).toContain('1/3 required reports');
  });
});
