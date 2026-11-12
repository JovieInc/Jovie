import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateSuite,
  formatSuite,
  NOISY_AUDIT_POLICY,
  parseAssertions,
  suiteNeedsBaseline,
} from './lighthouse-relative-budget.mjs';

const webRoot = resolve(import.meta.dirname, '..');
const readConfig = (name: string) =>
  JSON.parse(readFileSync(resolve(webRoot, name), 'utf8'));
const dashboardConfig = readConfig('.lighthouserc.dashboard.pr.json');
const onboardingConfig = readConfig('.lighthouserc.onboarding.pr.json');
const chatConfig = readConfig('.lighthouserc.chat.pr.json');

interface Metrics {
  fcp?: number;
  lcp?: number;
  tbt?: number;
  cls?: number;
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  speedIndex?: number;
  interactive?: number;
}

function report(path: string, metrics: Metrics = {}) {
  return {
    finalUrl: `http://localhost:3000${path}`,
    categories: {
      performance: { score: metrics.performance ?? 0.8 },
      accessibility: { score: metrics.accessibility ?? 1 },
      'best-practices': { score: metrics.bestPractices ?? 1 },
    },
    audits: {
      'first-contentful-paint': { numericValue: metrics.fcp ?? 1103 },
      'largest-contentful-paint': { numericValue: metrics.lcp ?? 2400 },
      'total-blocking-time': { numericValue: metrics.tbt ?? 400 },
      'cumulative-layout-shift': { numericValue: metrics.cls ?? 0 },
      'speed-index': { numericValue: metrics.speedIndex ?? 1500 },
      interactive: { numericValue: metrics.interactive ?? 2500 },
    },
  };
}

const DASHBOARD_PAGES = ['/app', '/app/library?view=releases'];
const runs = (metricsPerRun: Metrics[], pages = DASHBOARD_PAGES) =>
  pages.flatMap(page => metricsPerRun.map(metrics => report(page, metrics)));

function failures(evaluation: ReturnType<typeof evaluateSuite>) {
  return evaluation.pages.flatMap(page =>
    page.results
      .filter(result => result.status === 'fail')
      .map(
        result =>
          `${page.url} ${result.audit} ${(result as { reason?: string }).reason}`
      )
  );
}

describe('relative Lighthouse budgets', () => {
  // The exact runs that failed merge groups on unchanged code: best-of-three
  // FCP of 1100.4 to 1108 ms against the 1100 ms budget.
  const queueNoise: Metrics[][] = [
    [{ fcp: 1103.02 }, { fcp: 1102.14 }, { fcp: 1100.41 }],
    [{ fcp: 1116.77 }, { fcp: 1212.25 }, { fcp: 1100.45 }],
    [{ fcp: 1213.07 }, { fcp: 1130.19 }, { fcp: 1103.14 }],
    [{ fcp: 1108.45 }, { fcp: 1252.6 }, { fcp: 1125.63 }],
  ];

  it.each(queueNoise)(
    'reproduces the old failure: runner noise misses the fixed budget',
    (...head) => {
      const strict = evaluateSuite({
        config: dashboardConfig,
        headReports: runs(head),
      });
      expect(strict.passed).toBe(false);
      expect(failures(strict)).toEqual(
        DASHBOARD_PAGES.map(page => `${page} first-contentful-paint budget`)
      );
      // No baseline: a fixed budget miss is not rechecked.
      expect(strict.retryable).toBe(false);
    }
  );

  it.each(queueNoise)(
    'passes the same noise when base measured the same on this runner',
    (...head) => {
      const evaluation = evaluateSuite({
        config: dashboardConfig,
        headReports: runs(head),
        baseReports: runs([{ fcp: 1104.6 }, { fcp: 1213.5 }, { fcp: 1107.9 }]),
      });
      expect(failures(evaluation)).toEqual([]);
      expect(evaluation.passed).toBe(true);
    }
  );

  it('fails a planted regression even though noise passes', () => {
    // Head moved a whole FCP mode up (about 10%); base did not.
    const evaluation = evaluateSuite({
      config: dashboardConfig,
      headReports: runs([{ fcp: 1213.1 }, { fcp: 1251.4 }, { fcp: 1212.2 }]),
      baseReports: runs([{ fcp: 1103.0 }, { fcp: 1104.9 }, { fcp: 1105.9 }]),
    });
    expect(failures(evaluation)).toEqual(
      DASHBOARD_PAGES.map(page => `${page} first-contentful-paint regression`)
    );
    expect(evaluation.retryable).toBe(true);
  });

  // Job 130365864174: the first full run of this gate, head and base the same
  // app code. LCP on /app/library, in run order; the first three are the
  // first round, the last two the recheck.
  const REPLAY_HEAD = [2381, 3197, 2398, 3072, 3210];
  const REPLAY_BASE = [2449, 3070, 2191, 2790, 3139];
  const lcpRuns = (values: number[], shift = 0) => [
    ...runs(
      values.map(() => ({})),
      ['/app']
    ),
    ...runs(
      values.map(lcp => ({ lcp: lcp + shift })),
      ['/app/library?view=releases']
    ),
  ];

  it.each([3, 5])(
    'replay: the LCP noise that failed the first gate run passes (%i runs per side)',
    count => {
      const evaluation = evaluateSuite({
        config: dashboardConfig,
        headReports: lcpRuns(REPLAY_HEAD.slice(0, count)),
        baseReports: lcpRuns(REPLAY_BASE.slice(0, count)),
      });
      const lcp = evaluation.pages[1].results.find(
        result => result.audit === 'largest-contentful-paint'
      ) as { regression: number; allowed: number; separated: boolean };
      // Best against best is still over the tolerance, as it was in the job...
      expect(lcp.regression).toBeGreaterThan(lcp.allowed);
      // ...but the runs interleave, so it is not a regression.
      expect(lcp.separated).toBe(false);
      expect(failures(evaluation)).toEqual([]);
      expect(formatSuite('dashboard', evaluation).join('\n')).toContain(
        'runs overlap: noise, not a regression'
      );
    }
  );

  it('replay: the same runs with a real regression on top still fail', () => {
    // Slower than the whole spread base showed: every head run is past
    // every base run.
    const regressed = evaluateSuite({
      config: dashboardConfig,
      headReports: lcpRuns(REPLAY_HEAD, 800),
      baseReports: lcpRuns(REPLAY_BASE),
    });
    expect(failures(regressed)).toEqual([
      '/app/library?view=releases largest-contentful-paint regression',
    ]);
    // A slowdown inside the spread of identical runs cannot be told from
    // noise by a handful of runs; the ceiling is what bounds it.
    const withinNoise = evaluateSuite({
      config: dashboardConfig,
      headReports: lcpRuns(REPLAY_HEAD, 300),
      baseReports: lcpRuns(REPLAY_BASE),
    });
    expect(failures(withinNoise)).toEqual([]);
    const pastCeiling = evaluateSuite({
      config: dashboardConfig,
      headReports: lcpRuns(REPLAY_HEAD, 2200),
      baseReports: lcpRuns(REPLAY_BASE, 2200),
    });
    expect(failures(pastCeiling)).toEqual([
      '/app/library?view=releases largest-contentful-paint ceiling',
    ]);
  });

  it.each([
    ['total-blocking-time', { tbt: 400 }, { tbt: 520 }],
    ['largest-contentful-paint', { lcp: 2400 }, { lcp: 2650 }],
    ['categories:performance', { performance: 0.8 }, { performance: 0.75 }],
  ] as const)('fails a planted %s regression', (audit, base, head) => {
    const evaluation = evaluateSuite({
      config: dashboardConfig,
      headReports: runs([head, head, head], ['/app']),
      baseReports: runs([base, base, base], ['/app']),
    });
    expect(failures(evaluation)).toContain(`/app ${audit} regression`);
  });

  it('fails a regression on one page only, and names the page', () => {
    const evaluation = evaluateSuite({
      config: dashboardConfig,
      headReports: [
        ...runs([{ tbt: 400 }, { tbt: 410 }, { tbt: 420 }], ['/app']),
        ...runs(
          [{ tbt: 700 }, { tbt: 720 }, { tbt: 710 }],
          ['/app/library?view=releases']
        ),
      ],
      baseReports: runs([{ tbt: 400 }, { tbt: 430 }, { tbt: 405 }]),
    });
    expect(failures(evaluation)).toEqual([
      '/app/library?view=releases total-blocking-time regression',
    ]);
    expect(
      formatSuite('dashboard', evaluation).some(line =>
        /FAIL total-blocking-time: head 700 .* vs base 400 .*300 worse, allowed 100 worse/.test(
          line
        )
      )
    ).toBe(true);
  });

  it('holds the ceiling when base is just as slow: drift cannot ride the baseline', () => {
    const slow = [{ fcp: 1400 }, { fcp: 1410 }, { fcp: 1405 }];
    const evaluation = evaluateSuite({
      config: dashboardConfig,
      headReports: runs(slow),
      baseReports: runs(slow),
    });
    // 1100 ms budget, 1.2 ceiling factor.
    expect(failures(evaluation)).toEqual(
      DASHBOARD_PAGES.map(page => `${page} first-contentful-paint ceiling`)
    );
  });

  it('keeps every ceiling at or beyond its budget, and close to it', () => {
    for (const policy of Object.values(NOISY_AUDIT_POLICY)) {
      if ('ceilingFactor' in policy) {
        expect(policy.ceilingFactor).toBeGreaterThan(1);
        expect(policy.ceilingFactor).toBeLessThanOrEqual(1.5);
      } else {
        expect(policy.ceilingSlack).toBeGreaterThan(0);
        expect(policy.ceilingSlack).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('never relaxes audits that do not depend on runner speed', () => {
    // The 0.0747 layout shift that correctly failed three merge groups.
    const shifted = [{ cls: 0.074739 }, { cls: 0.074739 }, { cls: 0.074739 }];
    const evaluation = evaluateSuite({
      config: dashboardConfig,
      headReports: runs(shifted),
      // Even a base that shifts the same does not excuse it.
      baseReports: runs(shifted),
    });
    expect(failures(evaluation)).toEqual(
      DASHBOARD_PAGES.map(page => `${page} cumulative-layout-shift budget`)
    );
    expect(evaluation.retryable).toBe(false);

    const inaccessible = evaluateSuite({
      config: dashboardConfig,
      headReports: runs([{ accessibility: 0.85 }]),
      baseReports: runs([{ accessibility: 0.85 }]),
    });
    expect(failures(inaccessible)).toEqual(
      DASHBOARD_PAGES.map(page => `${page} categories:accessibility budget`)
    );
  });

  it('enforces the configured budget for a page base does not have', () => {
    const evaluation = evaluateSuite({
      config: dashboardConfig,
      headReports: runs([{ fcp: 1150 }, { fcp: 1160 }, { fcp: 1155 }]),
      baseReports: runs([{ fcp: 1150 }], ['/app']),
    });
    expect(failures(evaluation)).toEqual([
      '/app/library?view=releases first-contentful-paint budget',
    ]);
  });

  it('fails when a page was not measured or a report lacks the audit', () => {
    const onlyApp = evaluateSuite({
      config: dashboardConfig,
      headReports: runs([{ fcp: 1000 }], ['/app']),
    });
    expect(onlyApp.passed).toBe(false);
    expect(failures(onlyApp)).toEqual(['null (reports) missing']);

    const broken = report('/app');
    delete (broken.audits as Record<string, unknown>)['total-blocking-time'];
    const missingAudit = evaluateSuite({
      config: dashboardConfig,
      headReports: [broken, ...runs([{}], ['/app/library?view=releases'])],
      baseReports: runs([{}]),
    });
    expect(failures(missingAudit)).toEqual([
      '/app total-blocking-time missing',
    ]);
  });

  it('keeps warn-level assertions as warnings', () => {
    const evaluation = evaluateSuite({
      config: chatConfig,
      headReports: [report('/app/chat', { performance: 0.75 })],
    });
    expect(evaluation.passed).toBe(true);
    expect(evaluation.warnings).toBe(1);
    expect(suiteNeedsBaseline(chatConfig)).toBe(false);
    expect(suiteNeedsBaseline(dashboardConfig)).toBe(true);
    expect(suiteNeedsBaseline(onboardingConfig)).toBe(true);
  });

  it('judges onboarding by base too: the 0.92 score and 350 ms TBT sat on the noise', () => {
    const head = [
      { performance: 0.88, tbt: 419, lcp: 2000 },
      { performance: 0.9, tbt: 431, lcp: 2000 },
      { performance: 0.89, tbt: 469, lcp: 2000 },
    ];
    const strict = evaluateSuite({
      config: onboardingConfig,
      headReports: runs(head, ['/start']),
    });
    expect(failures(strict)).toEqual([
      '/start categories:performance budget',
      '/start total-blocking-time budget',
    ]);
    const relative = evaluateSuite({
      config: onboardingConfig,
      headReports: runs(head, ['/start']),
      baseReports: runs(
        [
          { performance: 0.91, tbt: 406, lcp: 2000 },
          { performance: 0.88, tbt: 483, lcp: 2000 },
          { performance: 0.87, tbt: 410, lcp: 2000 },
        ],
        ['/start']
      ),
    });
    expect(failures(relative)).toEqual([]);
  });

  it('rejects assertion shapes it does not evaluate instead of skipping them', () => {
    const withOptions = (options: unknown) => ({
      ci: {
        assert: {
          assertMatrix: [
            {
              matchingUrlPattern: '/app',
              assertions: { 'speed-index': options },
            },
          ],
        },
      },
    });
    expect(() =>
      parseAssertions(withOptions(['error', { maxLength: 0 }]))
    ).toThrow(/Unsupported assertion/);
    expect(() =>
      parseAssertions(
        withOptions([
          'error',
          { maxNumericValue: 1, aggregationMethod: 'median' },
        ])
      )
    ).toThrow(/Unsupported assertion/);
    expect(() =>
      parseAssertions({ ci: { assert: { preset: 'lighthouse:recommended' } } })
    ).toThrow(/no ci.assert.assertMatrix/);
    for (const config of [dashboardConfig, onboardingConfig, chatConfig]) {
      expect(parseAssertions(config).length).toBeGreaterThan(0);
    }
  });
});
