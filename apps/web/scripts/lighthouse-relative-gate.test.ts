import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  appendCollectionSummary,
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

  it('accounts separately for initial collections and paired rechecks, including unsuccessful attempts', async () => {
    const { options } = harness({
      verdicts: { onboarding: [{ passed: false, retryable: true }] },
      failCollect: (side, _suite, runs) => side === 'base' && runs === 2,
    });
    let elapsed = 0;
    const result = await decide({
      ...options,
      now: () => elapsed,
      collect: (
        side: string,
        suite: { name: string },
        count: number | null
      ) => {
        elapsed += count === null ? 100 : 200;
        return options.collect(side, suite, count);
      },
      hasBaseline: true,
      extraRuns: 2,
    });
    expect(result.passed).toBe(false);
    const initial = result.collections.filter(row => row.phase === 'initial');
    expect(initial.map(row => [row.side, row.suite])).toEqual([
      ['head', 'dashboard'],
      ['head', 'chat'],
      ['head', 'onboarding'],
      ['base', 'dashboard'],
      ['base', 'onboarding'],
    ]);
    expect(initial.every(row => row.elapsedMs === 100 && row.completed)).toBe(
      true
    );
    expect(result.collections.filter(row => row.phase === 'recheck')).toEqual([
      {
        suite: 'onboarding',
        side: 'head',
        phase: 'recheck',
        elapsedMs: 200,
        completed: true,
      },
      {
        suite: 'onboarding',
        side: 'base',
        phase: 'recheck',
        elapsedMs: 200,
        completed: false,
      },
    ]);
  });

  it('appends readable timings without replacing earlier job notes or hiding a failed collection', async () => {
    const { options } = harness({
      verdicts: {},
      failCollect: (_side, suite) => suite === 'chat',
    });
    let elapsed = 0;
    const result = await decide({
      ...options,
      now: () => (elapsed += 1250),
      hasBaseline: false,
      extraRuns: 0,
    });
    const dir = mkdtempSync(join(tmpdir(), 'lighthouse-summary-'));
    const summary = join(dir, 'job.md');
    try {
      writeFileSync(summary, 'Previous step\n');
      appendCollectionSummary(summary, result.collections);
      const markdown = readFileSync(summary, 'utf8');
      expect(markdown).toMatch(/^Previous step\n### Signed-in Lighthouse/);
      expect(markdown).toContain(
        '| dashboard | head | initial | 1.3s | Complete |'
      );
      expect(markdown).toContain('| chat | head | initial | 1.3s | Failed |');
      expect(result.passed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a missing or unwritable job summary as optional reporting', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lighthouse-summary-'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      appendCollectionSummary(undefined, []);
      expect(warn).not.toHaveBeenCalled();
      appendCollectionSummary(dir, []);
      expect(warn).toHaveBeenCalledWith(
        'Lighthouse collection times remain available in verdict.json.'
      );
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
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
