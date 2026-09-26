import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPLORATION_RATE,
  explorationPins,
  renderScorecard,
  replayCase,
  replayWithinBudget,
} from '../../pr-review/learn.mjs';
import {
  aggregate,
  emptyLedger,
  mergeLedger,
} from '../../pr-review/ledger.mjs';
import {
  isBehaviorFix,
  isCosmetic,
  mineSeeds,
  parseBlame,
  reviewablePath,
  touchedOldLines,
} from '../../pr-review/mine-seeds.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DAY = 86_400;

function syntheticRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'mine-seeds-'));
  const now = Math.floor(Date.now() / 1000);
  const git = (args, when) =>
    execFileSync('git', args, {
      cwd: dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'T',
        GIT_AUTHOR_EMAIL: 't@example.com',
        GIT_COMMITTER_NAME: 'T',
        GIT_COMMITTER_EMAIL: 't@example.com',
        ...(when
          ? {
              GIT_AUTHOR_DATE: `${when} +0000`,
              GIT_COMMITTER_DATE: `${when} +0000`,
            }
          : {}),
      },
    }).toString();
  const commit = (file, content, subject, when) => {
    writeFileSync(join(dir, file), content);
    git(['add', file]);
    git(['commit', '-q', '-m', subject], when);
    return git(['rev-parse', 'HEAD']).trim();
  };
  git(['init', '-q', '-b', 'main']);
  commit('README.md', 'x\n', 'chore: init', now - 60 * DAY);
  const quiet = commit(
    'quiet.ts',
    'export const q = 1;\n',
    'feat(web): add quiet module (#3)',
    now - 40 * DAY
  );
  const intro = commit(
    'total.ts',
    'export function total(a, b) {\n  return a - b;\n}\n',
    'feat(web): add totals (#1)',
    now - 20 * DAY
  );
  commit(
    'total.ts',
    'export function total(a, b) {\n  return a  -  b;\n}\n',
    'fix(web): flatten ternary (Sonar S3358) (#4)',
    now - 10 * DAY
  );
  const fix = commit(
    'total.ts',
    'export function total(a, b) {\n  return a + b;\n}\n',
    'fix(web): correct total sign (#2)',
    now - 1 * DAY
  );
  return { dir, intro, fix, quiet, gitIn: args => git(args) };
}

describe('mine-seeds helpers', () => {
  it('keeps behavior fixes and drops style, tooling and test fixes', () => {
    expect(isCosmetic('fix(web): flatten ternaries (Sonar S3358) (#1)')).toBe(
      true
    );
    expect(isCosmetic('refactor(api): split handler (#1)')).toBe(true);
    expect(isCosmetic('fix(web): correct total sign (#2)')).toBe(false);
    expect(isBehaviorFix('fix(web): correct total sign (#2)')).toBe(true);
    expect(
      isBehaviorFix('revert(marketing): revert #16425 waitlist (#17156)')
    ).toBe(true);
    expect(
      isBehaviorFix('fix(web): flatten ternaries (Sonar S3358) (#1)')
    ).toBe(false);
    expect(isBehaviorFix('fix(ci): repin hash (#1)')).toBe(false);
    expect(isBehaviorFix('feat(web): add thing (#1)')).toBe(false);
    expect(reviewablePath('apps/web/lib/a.ts')).toBe(true);
    expect(reviewablePath('apps/web/lib/a.test.ts')).toBe(false);
    expect(reviewablePath('pnpm-lock.yaml')).toBe(false);
  });

  it('reads old-side line numbers from a zero-context diff', () => {
    const patch = [
      '--- a/x',
      '+++ b/x',
      '@@ -2 +2 @@',
      '-old',
      '+new',
      '@@ -7,2 +7,0 @@',
      '-a',
      '-b',
      '\\ No newline',
    ].join('\n');
    expect(touchedOldLines(patch)).toEqual([2, 7, 8]);
  });

  it('parses porcelain blame headers', () => {
    const sha = 'a'.repeat(40);
    expect(parseBlame(`${sha} 12 3 1\nauthor T\n\tcode`)).toEqual([
      { sha, originalLine: 12 },
    ]);
  });
});

describe('mineSeeds', () => {
  it('blames through a Sonar-only change to the PR that introduced the line', async () => {
    const repo = syntheticRepo();
    const { defects, clean } = await mineSeeds({
      git: args => Promise.resolve(repo.gitIn(args)),
      options: {
        days: 120,
        maxCases: 6,
        cleanFraction: 1 / 3,
        cleanQuietDays: 14,
        maxExpectedLines: 30,
        ref: 'main',
      },
    });
    // A Sonar fix reshaped the line between the feature and the behavior
    // fix; blame must look through it to the feature PR.
    expect(defects).toEqual([
      expect.objectContaining({
        pr: 1,
        headSha: repo.intro,
        expected: [{ path: 'total.ts', line: 2 }],
      }),
    ]);
    expect(clean.map(c => c.pr)).toContain(3);
    expect(clean.every(c => c.clean)).toBe(true);
  });

  it('labels the introducing PR when no style fix intervenes', async () => {
    const repo = syntheticRepo();
    // Replay without the Sonar commit: rebuild history where the fix
    // directly follows the intro.
    const dir = mkdtempSync(join(tmpdir(), 'mine-direct-'));
    const now = Math.floor(Date.now() / 1000);
    const git = (args, when) =>
      execFileSync('git', args, {
        cwd: dir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'T',
          GIT_AUTHOR_EMAIL: 't@example.com',
          GIT_COMMITTER_NAME: 'T',
          GIT_COMMITTER_EMAIL: 't@example.com',
          GIT_AUTHOR_DATE: `${when ?? now} +0000`,
          GIT_COMMITTER_DATE: `${when ?? now} +0000`,
        },
      }).toString();
    git(['init', '-q', '-b', 'main']);
    writeFileSync(join(dir, 'README.md'), 'x\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'chore: init'], now - 30 * DAY);
    writeFileSync(
      join(dir, 'total.ts'),
      'export const total = (a, b) => a - b;\n'
    );
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feat(web): add totals (#1)'], now - 20 * DAY);
    const intro = git(['rev-parse', 'HEAD']).trim();
    writeFileSync(
      join(dir, 'total.ts'),
      'export const total = (a, b) => a + b;\n'
    );
    git(['add', '.']);
    git(['commit', '-q', '-m', 'fix(web): correct total sign (#2)'], now - DAY);
    const { defects } = await mineSeeds({
      git: args => Promise.resolve(git(args)),
      options: {
        days: 120,
        maxCases: 3,
        cleanFraction: 0,
        cleanQuietDays: 14,
        maxExpectedLines: 30,
        ref: 'main',
      },
    });
    expect(defects).toEqual([
      expect.objectContaining({
        pr: 1,
        headSha: intro,
        expected: [{ path: 'total.ts', line: 1 }],
      }),
    ]);
    expect(repo.intro).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('ledger', () => {
  const outcome = (modelId, success) => ({
    modelId,
    capability: 'review',
    success,
    tokensIn: 10,
    tokensOut: 2,
    minutes: 1,
  });

  it('aggregates per model and capability', () => {
    expect(
      aggregate({ a: { outcomes: [outcome('m', true), outcome('m', false)] } })
    ).toEqual({
      m: {
        review: {
          attempts: 2,
          successes: 1,
          tokens_in: 20,
          tokens_out: 4,
          minutes: 2,
        },
      },
    });
  });

  it('replaces a re-run case instead of double counting', () => {
    const first = mergeLedger(
      emptyLedger(),
      { a: { outcomes: [outcome('m', false)] } },
      't1'
    );
    const second = mergeLedger(
      first,
      {
        a: { outcomes: [outcome('m', true)] },
        b: { outcomes: [outcome('m', true)] },
      },
      't2'
    );
    expect(second.outcomes.m.review).toMatchObject({
      attempts: 2,
      successes: 2,
    });
    expect(second.updatedAt).toBe('t2');
    expect(mergeLedger({ schema: 'other' }, {}, 't').cases).toEqual({});
  });
});

describe('learn loop', () => {
  const rankings = {
    discovery: { ranked: [{ model: 'a/top' }, { model: 'b/second' }] },
    verification: { ranked: [{ model: 'c/verify' }] },
  };

  it('explores the runner-up on a deterministic ~10% of cases', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `case-${i}`);
    const pinned = ids.filter(
      id => explorationPins(id, rankings).PR_REVIEW_DISCOVERY_MODEL
    );
    expect(pinned.length / ids.length).toBeGreaterThan(EXPLORATION_RATE - 0.03);
    expect(pinned.length / ids.length).toBeLessThan(EXPLORATION_RATE + 0.03);
    expect(explorationPins(pinned[0], rankings)).toEqual({
      PR_REVIEW_DISCOVERY_MODEL: 'b/second',
    });
    expect(
      explorationPins(pinned[0], { discovery: { ranked: [{ model: 'a' }] } })
    ).toEqual({});
  });

  it('stops replaying once the budget is spent and skips failed replays', async () => {
    const cases = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const spends = { a: 2, b: null, c: 4, d: 1 };
    const { done, spent } = await replayWithinBudget(cases, {
      budgetUsd: 5,
      pinsFor: () => ({}),
      replay: async entry =>
        spends[entry.id] === null ? null : { spend: { usd: spends[entry.id] } },
    });
    expect(done.map(d => d.id)).toEqual(['a', 'c']);
    expect(spent).toBe(6);
  });

  it('runs the real CLI in replay mode and reads its receipt', async () => {
    const workdir = mkdtempSync(join(tmpdir(), 'learn-replay-'));
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT })
      .toString()
      .trim();
    const base = execFileSync('git', ['rev-parse', 'HEAD~1'], {
      cwd: REPO_ROOT,
    })
      .toString()
      .trim();
    const receipt = await replayCase(
      { id: 'smoke', pr: 1, baseSha: base, headSha: head },
      { workdir, env: { ...process.env, PR_REVIEW_AI_GATEWAY_API_KEY: '' } }
    );
    expect(receipt).toMatchObject({
      status: 'incomplete',
      failure: 'no-key',
      headSha: head,
    });
    const failed = await replayCase(
      { id: 'bad', pr: 1, baseSha: 'x', headSha: head },
      { workdir, env: process.env }
    );
    expect(failed).toBeNull();
  });

  it('renders a scorecard with per-model rates and sensitivity rows', () => {
    const ledger = mergeLedger(emptyLedger(), {
      a: { outcomes: [{ modelId: 'm', capability: 'review', success: true }] },
    });
    const card = renderScorecard(
      {
        cases: 1,
        precision: 1,
        recall: null,
        cleanFalseAlarmRate: 0,
        incompleteRate: 0,
        usdTotal: 0.01,
      },
      ledger,
      [{ failureCost: 5, discovery: 'a/top', verification: 'c/verify' }]
    );
    expect(card).toContain('| m | review | 1 | 1.00 |');
    expect(card).toContain('recall n/a');
    expect(card).toContain('| $5 | a/top | c/verify |');
  });
});

describe('router reads the shared ledger', () => {
  it('adds ledger outcomes to routing and ignores bad files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ledger-router-'));
    const path = join(dir, 'model-outcomes.json');
    const ledger = mergeLedger(emptyLedger(), {
      ...Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `c${i}`,
          {
            outcomes: [
              {
                modelId: 'gateway-deepseek-v4.1-flash',
                capability: 'review',
                success: false,
                tokensIn: 60000,
                tokensOut: 20000,
              },
            ],
          },
        ])
      ),
    });
    writeFileSync(path, JSON.stringify(ledger));
    const rank = env =>
      JSON.parse(
        spawnSync(
          'python3',
          [
            resolve(REPO_ROOT, 'scripts/symphony/model-router.py'),
            'rank',
            '--capability',
            'review',
            '--provider',
            'vercel-ai-gateway',
          ],
          {
            env: {
              ...process.env,
              GEM_MODEL_ROUTER_STATE: join(dir, 'state.json'),
              ...env,
            },
          }
        ).stdout.toString()
      ).ranked;
    expect(rank({})[0].id).toBe('gateway-deepseek-v4.1-flash');
    // Ten recorded misses push V4.1 Flash off the top.
    expect(rank({ GEM_MODEL_OUTCOMES: path })[0].id).not.toBe(
      'gateway-deepseek-v4.1-flash'
    );
    writeFileSync(path, '{not json');
    expect(rank({ GEM_MODEL_OUTCOMES: path })[0].id).toBe(
      'gateway-deepseek-v4.1-flash'
    );
    writeFileSync(path, JSON.stringify({ schema: 'other', outcomes: {} }));
    expect(rank({ GEM_MODEL_OUTCOMES: path })[0].id).toBe(
      'gateway-deepseek-v4.1-flash'
    );
    expect(readFileSync(path, 'utf8')).toContain('other');
  });
});

describe('pr-review-learn workflow contract', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/pr-review-learn.yml'),
    'utf8'
  );

  it('is disabled by default, read-only, full-history and main-only', () => {
    expect(workflow).toContain('# clock-class: temporal-resource');
    expect(workflow).toContain(
      'controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain("vars.PR_REVIEW_LEARN_ENABLED == 'true'");
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('permissions: {}');
    expect(workflow).not.toMatch(/:\s*write\b/);
    expect(workflow).toContain('retention-days: 90');
  });
});
