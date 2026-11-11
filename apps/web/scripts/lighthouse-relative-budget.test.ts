import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateSuite,
  formatSuite,
  NOISY_AUDIT_POLICY,
  parseAssertions,
  suiteNeedsBaseline,
} from './lighthouse-relative-budget.mjs';
import {
  decide,
  readBuildId,
  resolveSuites,
  withBaselineInPlace,
} from './lighthouse-relative-gate.mjs';

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
      baseReports: runs([{ fcp: 1103.0 }, { fcp: 1213.5 }, { fcp: 1105.9 }]),
    });
    expect(failures(evaluation)).toEqual(
      DASHBOARD_PAGES.map(page => `${page} first-contentful-paint regression`)
    );
    expect(evaluation.retryable).toBe(true);
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

describe('relative Lighthouse gate flow', () => {
  const scripts = JSON.parse(
    readFileSync(resolve(webRoot, 'package.json'), 'utf8')
  ).scripts as Record<string, string>;
  const suites = resolveSuites(scripts);

  function harness({
    verdicts,
    failCollect = () => false,
    failServer = () => false,
  }: {
    verdicts: Record<string, { passed: boolean; retryable: boolean }[]>;
    failCollect?: (side: string, suite: string) => boolean;
    failServer?: (side: string) => boolean;
  }) {
    const calls: string[] = [];
    const evaluated: string[] = [];
    const round: Record<string, number> = {};
    return {
      calls,
      evaluated,
      options: {
        suites,
        log: () => undefined,
        async withServer(side: string, work: () => Promise<void>) {
          if (failServer(side)) throw new Error(`${side} server died`);
          calls.push(`server:${side}`);
          await work();
        },
        collect(side: string, suite: { name: string }, count: number | null) {
          calls.push(`${side}:${suite.name}:${count ?? 'config'}`);
          return !failCollect(side, suite.name);
        },
        evaluate(suite: { name: string }, withBase: boolean) {
          const index = round[suite.name] ?? 0;
          round[suite.name] = index + 1;
          evaluated.push(`${suite.name}:${withBase ? 'relative' : 'strict'}`);
          const list = verdicts[suite.name] ?? [
            { passed: true, retryable: false },
          ];
          return {
            pages: [],
            warnings: 0,
            ...list[Math.min(index, list.length - 1)],
          };
        },
      },
    };
  }

  it('reads each suite config from its package script', () => {
    expect(
      suites.map(suite => [suite.name, suite.configPath, suite.needsBaseline])
    ).toEqual([
      ['dashboard', '.lighthouserc.dashboard.pr.json', true],
      ['chat', '.lighthouserc.chat.pr.json', false],
      ['onboarding', '.lighthouserc.onboarding.pr.json', true],
    ]);
  });

  it('measures head then base once when everything passes', async () => {
    const { calls, evaluated, options } = harness({ verdicts: {} });
    const result = await decide({
      ...options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(result.passed).toBe(true);
    expect(calls).toEqual([
      'server:head',
      'head:dashboard:config',
      'head:chat:config',
      'head:onboarding:config',
      'server:base',
      'base:dashboard:config',
      'base:onboarding:config',
    ]);
    expect(evaluated).toEqual([
      'dashboard:relative',
      'chat:strict',
      'onboarding:relative',
    ]);
  });

  it('without a baseline enforces the configured budgets and never rechecks', async () => {
    const { calls, evaluated, options } = harness({
      verdicts: { dashboard: [{ passed: false, retryable: true }] },
    });
    const result = await decide({
      ...options,
      hasBaseline: false,
      extraRuns: 2,
    });
    expect(result.passed).toBe(false);
    expect(calls.filter(call => call.startsWith('server:'))).toEqual([
      'server:head',
    ]);
    expect(evaluated).toEqual([
      'dashboard:strict',
      'chat:strict',
      'onboarding:strict',
    ]);
  });

  it('falls back to the configured budgets when the base server dies', async () => {
    const { evaluated, options } = harness({
      verdicts: {},
      failServer: side => side === 'base',
    });
    const result = await decide({
      ...options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(result.passed).toBe(true);
    expect(evaluated).toEqual([
      'dashboard:strict',
      'chat:strict',
      'onboarding:strict',
    ]);
  });

  it('rechecks a failed timing verdict with more runs on both sides, once', async () => {
    const cleared = harness({
      verdicts: {
        onboarding: [
          { passed: false, retryable: true },
          { passed: true, retryable: false },
        ],
      },
    });
    const pass = await decide({
      ...cleared.options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(pass.passed).toBe(true);
    expect(cleared.calls.slice(7)).toEqual([
      'server:head',
      'head:onboarding:2',
      'server:base',
      'base:onboarding:2',
    ]);

    const confirmed = harness({
      verdicts: { onboarding: [{ passed: false, retryable: true }] },
    });
    const fail = await decide({
      ...confirmed.options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(fail.passed).toBe(false);
    expect(
      confirmed.calls.filter(call => call === 'head:onboarding:2')
    ).toHaveLength(1);
  });

  it('does not recheck a fixed budget miss, and fails when head cannot be measured', async () => {
    const fixed = harness({
      verdicts: { dashboard: [{ passed: false, retryable: false }] },
    });
    const result = await decide({
      ...fixed.options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(result.passed).toBe(false);
    expect(fixed.calls).toHaveLength(7);

    const unmeasured = harness({
      verdicts: {},
      failCollect: (side, suite) => side === 'head' && suite === 'chat',
    });
    const blocked = await decide({
      ...unmeasured.options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(blocked.passed).toBe(false);
    expect(unmeasured.evaluated).toEqual([]);
  });
});

describe('collect-only report hand-off', () => {
  const { collectOnly } = createRequire(import.meta.url)(
    './lighthouse-dashboard-auth.cjs'
  ) as {
    collectOnly: (options: {
      collectDir: string;
      config: string;
      chromePath: string;
      collectUrls: string[];
      env: NodeJS.ProcessEnv;
      lhciDir: string;
    }) => number;
  };

  it("hands over only the reports this collection wrote, never an earlier side's", () => {
    const dir = mkdtempSync(join(tmpdir(), 'lighthouse-collect-'));
    try {
      const lhciDir = join(dir, '.lighthouseci');
      const bin = join(dir, 'bin');
      mkdirSync(lhciDir);
      mkdirSync(bin);
      // A collector that, unlike lhci today, does not clear old reports.
      writeFileSync(
        join(bin, 'pnpm'),
        '#!/usr/bin/env bash\necho \'{"side":"head"}\' > "$STUB_LHCI_DIR/lhr-2.json"\n'
      );
      chmodSync(join(bin, 'pnpm'), 0o755);
      // Left behind by the base collection that ran just before.
      writeFileSync(join(lhciDir, 'lhr-1.json'), '{"side":"base"}');
      writeFileSync(join(lhciDir, 'keep.txt'), 'not a report');

      const collectDir = join(dir, 'head');
      const status = collectOnly({
        collectDir,
        config: '.lighthouserc.dashboard.pr.json',
        chromePath: '/bin/true',
        collectUrls: ['http://localhost:3000/app'],
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          STUB_LHCI_DIR: lhciDir,
          LIGHTHOUSE_COLLECT_UPLOAD: '',
        },
        lhciDir,
      });

      expect(status).toBe(0);
      expect(readdirSync(collectDir)).toEqual(['lhr-2.json']);
      expect(readFileSync(join(collectDir, 'lhr-2.json'), 'utf8')).toContain(
        'head'
      );
      expect(readdirSync(lhciDir).sort()).toEqual(['keep.txt', 'lhr-2.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("serving the base build from the head build's place", () => {
  const tree = (root: string, buildId: string) => {
    mkdirSync(join(root, 'apps/web/.next'), { recursive: true });
    writeFileSync(join(root, 'apps/web/.next/BUILD_ID'), buildId);
  };
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'lighthouse-swap-'));
    const headRoot = join(dir, 'ws/.next/standalone');
    const baselineRoot = join(dir, 'temp/baseline');
    tree(headRoot, 'head-build');
    tree(baselineRoot, 'base-build');
    return { dir, headRoot, baselineRoot };
  };

  it('serves base where head was built, then puts head back', async () => {
    const { dir, headRoot, baselineRoot } = setup();
    try {
      let served: string | null = null;
      await withBaselineInPlace({ headRoot, baselineRoot }, async () => {
        served = readBuildId(headRoot);
      });
      expect(served).toBe('base-build');
      expect(readBuildId(headRoot)).toBe('head-build');
      expect(readBuildId(baselineRoot)).toBe('base-build');
      expect(readdirSync(join(dir, 'ws/.next'))).toEqual(['standalone']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('puts head back when measuring base throws', async () => {
    const { dir, headRoot, baselineRoot } = setup();
    try {
      await expect(
        withBaselineInPlace({ headRoot, baselineRoot }, async () => {
          throw new Error('server died');
        })
      ).rejects.toThrow('server died');
      expect(readBuildId(headRoot)).toBe('head-build');
      expect(readBuildId(baselineRoot)).toBe('base-build');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves head alone when there is no base build to serve', async () => {
    const { dir, headRoot } = setup();
    try {
      await expect(
        withBaselineInPlace(
          { headRoot, baselineRoot: join(dir, 'temp/missing') },
          async () => undefined
        )
      ).rejects.toThrow('No base build');
      expect(readBuildId(headRoot)).toBe('head-build');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses when head's place does not hold head afterwards", async () => {
    const { dir, headRoot, baselineRoot } = setup();
    try {
      await expect(
        withBaselineInPlace({ headRoot, baselineRoot }, async () => {
          // Something swapped the parked head build while base was served.
          writeFileSync(
            join(`${headRoot}-head`, 'apps/web/.next/BUILD_ID'),
            'other'
          );
        })
      ).rejects.toThrow('Head build was not restored');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
