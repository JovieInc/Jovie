import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  baselineWithHeadroom,
  evaluateBudgets,
  findBaselineSlack,
  grownBudgetNumbers,
  measureFirstLoadJs,
  tightenBudgets,
} from './route-js-budget.mjs';
import {
  buildFirstLoadFixture,
  cleanupFixtures,
  firstLoadBudgets,
  judge,
  NOW,
  validRaise,
  writeAncestorGitRepo,
  writeChunk,
} from './route-js-budget-fixtures';

afterEach(() => {
  vi.unstubAllEnvs();
  cleanupFixtures();
});

const row = (route: string, gzipKb: number) => ({ route, gzipKb, chunks: 1 });

function budgetsWithGroups() {
  const budgets = firstLoadBudgets({
    admin: { baselineKb: 1345 },
    dashboard: { baselineKb: 1385 },
    marketing: { baselineKb: 50 },
    public: { baselineKb: 80 },
  });
  budgets.routes = { '/app/chat': 1385, '/app/gone': 900 };
  return budgets;
}

describe('per-route initial JS ratchet (JOV-8555)', () => {
  it('records measured size plus two percent and only ever lowers a baseline', () => {
    const budgets = budgetsWithGroups();
    const { budgets: next, changes } = tightenBudgets({
      budgets,
      appRows: [row('/app/chat', 800), row('/app/new', 500)],
      publicRows: [
        row('/', 20),
        // Over its baseline: --write must not absorb the growth.
        row('/product', 40),
        row('/solutions/[audience]', 20),
        row('/about', 60),
      ],
    });

    expect(next.routes).toEqual({ '/app/chat': 816, '/app/new': 510 });
    expect(next.firstLoad.baselines).toEqual({
      '/about': 61,
      '/product': 32,
      '/': 20,
      '/solutions/[audience]': 20,
    });
    // Each group drops to its worst route baseline, never up.
    expect(next.groups).toEqual({
      admin: { baselineKb: 1345 },
      dashboard: { baselineKb: 816 },
      marketing: { baselineKb: 32 },
      public: { baselineKb: 61 },
    });
    expect(changes.map(change => `${change.kind} ${change.key}`)).toEqual([
      'lowered routes./app/chat',
      'added routes./app/new',
      'removed routes./app/gone',
      'lowered firstLoad.baselines./',
      'lowered firstLoad.baselines./solutions/[audience]',
      'lowered firstLoad.baselines./about',
      'lowered groups.dashboard.baselineKb',
      'lowered groups.marketing.baselineKb',
      'lowered groups.public.baselineKb',
    ]);
    // Tightening is never growth against the previous file.
    expect(grownBudgetNumbers(next, budgets, NOW)).toEqual([]);
    // Idempotent: a second pass over the same build changes nothing.
    expect(
      tightenBudgets({
        budgets: next,
        appRows: [row('/app/chat', 800), row('/app/new', 500)],
        publicRows: [
          row('/', 20),
          row('/product', 32),
          row('/solutions/[audience]', 20),
          row('/about', 60),
        ],
      }).changes
    ).toEqual([]);
  });

  it('takes the heaviest manifest when parallel routes share one route', () => {
    const { budgets } = tightenBudgets({
      budgets: firstLoadBudgets(),
      appRows: [row('/app/chat', 700), row('/app/chat', 900)],
      publicRows: [],
    });
    expect(budgets.routes['/app/chat']).toBe(baselineWithHeadroom(900));
  });

  it('fails a route that grew past its baseline, with no default to hide behind', () => {
    const budgets = firstLoadBudgets();
    budgets.routes = { '/app/chat': 816 };
    const result = evaluateBudgets({
      appRows: [row('/app/chat', 817)],
      firstRows: [
        row('/', 20),
        row('/product', 20),
        row('/solutions/[audience]', 20),
        row('/about', 60),
      ],
      budgets,
      ancestor: budgets,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.app.violations).toEqual([
      { ...row('/app/chat', 817), budgetKb: 816 },
    ]);
    expect(
      evaluateBudgets({
        appRows: [row('/app/chat', 816)],
        firstRows: result.first.rows,
        budgets,
        ancestor: budgets,
        now: NOW,
      }).ok
    ).toBe(true);
  });

  it('fails closed on a new route until it has a baseline', () => {
    const budgets = firstLoadBudgets();
    const rows = measureFirstLoadJs(buildFirstLoadFixture());
    const withNew = [...rows, row('/pricing', 10), row('/app/new', 10)];
    const red = evaluateBudgets({
      appRows: withNew.filter(item => item.route.startsWith('/app')),
      firstRows: withNew,
      budgets,
      ancestor: budgets,
      now: NOW,
    });
    expect(red.ok).toBe(false);
    expect(red.first.unlisted.map(item => item.route)).toEqual(['/pricing']);
    expect(red.app.unlisted.map(item => item.route)).toEqual(['/app/new']);
    expect(red.app.violations).toEqual([]);

    budgets.firstLoad.baselines['/pricing'] = 10;
    budgets.routes['/app/new'] = 10;
    expect(
      evaluateBudgets({
        appRows: withNew.filter(item => item.route.startsWith('/app')),
        firstRows: withNew,
        budgets,
        ancestor: budgets,
        now: NOW,
      }).ok
    ).toBe(true);
  });

  it('lets a hand-raised baseline through only while its override is unexpired', () => {
    const ancestor = firstLoadBudgets();
    const rows = measureFirstLoadJs(buildFirstLoadFixture());
    const raised = structuredClone(ancestor);
    raised.firstLoad.baselines['/about'] = 95;
    expect(judge(raised, rows, ancestor).growth).toEqual([
      'firstLoad.baselines./about grew 80 -> 95',
    ]);

    raised.raises = {
      'firstLoad.baselines./about': validRaise({ expiresOn: '2026-10-21' }),
    };
    const expired = judge(raised, rows, ancestor);
    expect(expired.ok).toBe(false);
    expect(expired.growth).toEqual([
      'firstLoad.baselines./about grew 80 -> 95',
    ]);

    raised.raises = {
      'firstLoad.baselines./about': validRaise({ expiresOn: '2026-10-22' }),
    };
    const live = judge(raised, rows, ancestor);
    expect(live.growth).toEqual([]);
    expect(live.ok).toBe(true);

    // A new route's first baseline may not exceed its section ceiling either.
    const added = structuredClone(ancestor);
    added.firstLoad.baselines['/heavy'] = 200;
    added.routes['/app/heavy'] = 950;
    expect(grownBudgetNumbers(added, ancestor, NOW)).toEqual([
      'routes./app/heavy grew 900 -> 950',
      'firstLoad.baselines./heavy grew 80 -> 200',
    ]);
  });

  it('reports slack without failing, so a lighter route needs no budget edit', () => {
    const budgets = firstLoadBudgets();
    const rows = [
      row('/', 20),
      row('/product', 32),
      row('/solutions/[audience]', 32),
      row('/about', 60),
    ];
    expect(findBaselineSlack(rows, budgets.firstLoad.baselines)).toEqual([
      { route: '/about', gzipKb: 60, baselineKb: 80 },
      { route: '/', gzipKb: 20, baselineKb: 32 },
    ]);
    const result = judge(budgets, rows);
    expect(result.slack.map(item => item.route)).toEqual(['/about', '/']);
    expect(result.ok).toBe(true);
  });
});

describe('route-js-budget --write', () => {
  function cli(
    nextDir: string,
    budgetPath: string,
    env: NodeJS.ProcessEnv,
    ...flags: string[]
  ) {
    return spawnSync(
      process.execPath,
      [
        join(__dirname, 'route-js-budget.mjs'),
        '--next-dir',
        nextDir,
        '--budgets',
        budgetPath,
        ...flags,
      ],
      {
        encoding: 'utf8',
        timeout: 20000,
        env,
      }
    );
  }

  it('writes baselines the next run passes, then refuses to absorb growth', () => {
    const nextDir = buildFirstLoadFixture();
    const appDir = join(nextDir, 'server', 'app', 'app', '(shell)', 'chat');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      join(appDir, 'page_client-reference-manifest.js'),
      `globalThis.__RSC_MANIFEST = ${JSON.stringify({
        '/app/(shell)/chat/page': {
          entryJSFiles: { page: [writeChunk(nextDir, 'chat.js', 8 * 1024)] },
        },
      })};`
    );
    const budgetPath = join(nextDir, 'route-js-budgets.json');
    const budgets = budgetsWithGroups();
    // --write leaves an unmeasured group alone. That leftover must already
    // match origin/main or the CLI reports growth against the live ratchet.
    const committedAdminKb = (
      JSON.parse(
        readFileSync(join(__dirname, 'route-js-budgets.json'), 'utf8')
      ) as { groups: { admin: { baselineKb: number } } }
    ).groups.admin.baselineKb;
    budgets.groups.admin.baselineKb = committedAdminKb;
    budgets.firstLoad.baselines = {};
    budgets.routes = {};
    writeFileSync(budgetPath, JSON.stringify(budgets));
    // The CLI compares the budgets file with origin/main through git, so the
    // test points git at a fixture repo holding these fixture budgets —
    // otherwise the real repository's baselines leak into the run.
    const cliEnv = writeAncestorGitRepo(nextDir, {
      'apps/web/scripts/route-js-budgets.json': readFileSync(
        budgetPath,
        'utf8'
      ),
      'docs/performance/route-budgets.json': readFileSync(
        join(__dirname, '../../../docs/performance/route-budgets.json'),
        'utf8'
      ),
    });

    // A parent Git common directory must not leak back into CLI subprocesses.
    vi.stubEnv('GIT_COMMON_DIR', join(nextDir, 'unrelated-parent-git'));

    const closed = cli(nextDir, budgetPath, cliEnv);
    expect(closed.status).toBe(1);
    expect(closed.stderr).toContain(
      '/about ships 48 KB gzip initial JS and has no baseline (new routes fail closed). Add "/about": 48 under firstLoad.baselines'
    );
    expect(closed.stderr).toContain('--write');

    const written = cli(nextDir, budgetPath, cliEnv, '--write');
    expect(written.status, written.stderr).toBe(0);
    const recorded = JSON.parse(readFileSync(budgetPath, 'utf8'));
    expect(recorded.firstLoad.baselines).toEqual({
      '/about': 48,
      '/': 16,
      '/product': 16,
      '/solutions/[audience]': 16,
    });
    expect(recorded.routes).toEqual({ '/app/chat': 16 });
    expect(recorded.groups).toEqual({
      admin: { baselineKb: committedAdminKb },
      dashboard: { baselineKb: 16 },
      marketing: { baselineKb: 16 },
      public: { baselineKb: 48 },
    });
    expect(cli(nextDir, budgetPath, cliEnv).status).toBe(0);

    writeChunk(nextDir, 'about.js', 48 * 1024);
    const grown = cli(nextDir, budgetPath, cliEnv, '--write');
    expect(grown.status).toBe(1);
    expect(grown.stderr).toContain(
      '/about ships 56 KB gzip initial JS; its baseline is 48 KB (+8 KB)'
    );
    expect(grown.stderr).toContain('raises["firstLoad.baselines./about"]');
    expect(
      JSON.parse(readFileSync(budgetPath, 'utf8')).firstLoad.baselines['/about']
    ).toBe(48);
  });
});
