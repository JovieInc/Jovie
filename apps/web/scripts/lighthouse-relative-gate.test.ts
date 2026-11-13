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
  decide,
  readBuildId,
  resolveSuites,
  withBaselineInPlace,
} from './lighthouse-relative-gate.mjs';

const webRoot = resolve(import.meta.dirname, '..');

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
    failCollect?: (
      side: string,
      suite: string,
      count: number | null
    ) => boolean;
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
          return !failCollect(side, suite.name, count);
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

  it('keeps the first verdict when the recheck lands on one side only', async () => {
    // Head gets its extra runs, base does not. Judging head's best of more
    // runs against base's best of fewer would pass here; it must not count.
    const verdicts = {
      onboarding: [
        { passed: false, retryable: true },
        { passed: true, retryable: false },
      ],
    };
    const baseCollectFails = harness({
      verdicts,
      failCollect: (side, _suite, count) => side === 'base' && count === 2,
    });
    const first = await decide({
      ...baseCollectFails.options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(baseCollectFails.calls).toContain('head:onboarding:2');
    expect(first.passed).toBe(false);
    expect(
      baseCollectFails.evaluated.filter(name => name.startsWith('onboarding'))
    ).toHaveLength(1);

    let baseStarts = 0;
    const baseServerDies = harness({
      verdicts,
      failServer: side => side === 'base' && ++baseStarts > 1,
    });
    const second = await decide({
      ...baseServerDies.options,
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(second.passed).toBe(false);
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
