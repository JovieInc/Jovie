import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateBudgets,
  measureFirstLoadJs,
  routeJsContributors,
} from './route-js-budget.mjs';
import {
  buildFirstLoadFixture,
  cleanupFixtures,
  firstLoadBudgets,
  NOW,
  validRaise,
  writeAncestorGitRepo,
  writeChunk,
} from './route-js-budget-fixtures';

afterEach(() => {
  vi.unstubAllEnvs();
  cleanupFixtures();
});

// The CLI compares this fixture with origin/main's route-js-budgets.json.
// Group and route ceilings that the cases do not intentionally move must stay
// at the committed ratchet, or a later --write looks like growth.
const committedBudgets = JSON.parse(
  readFileSync(join(__dirname, 'route-js-budgets.json'), 'utf8')
) as {
  routes: { '/app/chat': number };
  groups: { admin: { baselineKb: number }; dashboard: { baselineKb: number } };
};

function control() {
  const budgets = firstLoadBudgets({
    admin: { baselineKb: committedBudgets.groups.admin.baselineKb },
    dashboard: { baselineKb: committedBudgets.groups.dashboard.baselineKb },
    marketing: { baselineKb: 50 },
    public: { baselineKb: 80 },
  });
  budgets.routes['/app/chat'] = committedBudgets.routes['/app/chat'];
  const routeGroups = {
    admin: { budgets: { initialJS_gzip_kb: 300 } },
    dashboard: { budgets: { initialJS_gzip_kb: 250 } },
    marketing: { budgets: { initialJS_gzip_kb: 150 } },
    public: { budgets: { initialJS_gzip_kb: 180 } },
  };
  return {
    appRows: [{ route: '/app/chat', gzipKb: 1, chunks: 1 }],
    firstRows: [
      { route: '/', gzipKb: 20, chunks: 1 },
      { route: '/product', gzipKb: 20, chunks: 1 },
      { route: '/solutions/[audience]', gzipKb: 20, chunks: 1 },
      { route: '/about', gzipKb: 60, chunks: 1 },
    ],
    budgets,
    ancestor: structuredClone(budgets),
    routeGroups,
    routeGroupsAncestor: structuredClone(routeGroups),
    now: NOW,
  };
}

function cliFixture() {
  const nextDir = buildFirstLoadFixture();
  const chunk = writeChunk(nextDir, 'dashboard.js', 512);
  const appDir = join(nextDir, 'server', 'app', 'app', '(shell)', 'chat');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    join(appDir, 'page_client-reference-manifest.js'),
    `globalThis.__RSC_MANIFEST = ${JSON.stringify({
      '/app/(shell)/chat/page': { entryJSFiles: { page: [chunk] } },
    })};`
  );
  return {
    nextDir,
    budgets: control().budgets,
    budgetPath: join(nextDir, 'route-js-budgets.json'),
  };
}

function runCli(nextDir: string, budgetPath: string, env = process.env) {
  return spawnSync(
    process.execPath,
    [
      join(__dirname, 'route-js-budget.mjs'),
      '--next-dir',
      nextDir,
      '--budgets',
      budgetPath,
      '--json',
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...env, GIT_NO_LAZY_FETCH: '1' },
    }
  );
}

describe('route-group policy reaches the existing evaluator and CLI', () => {
  it('explains public first-load manifests with the same measurement as the gate', () => {
    const nextDir = buildFirstLoadFixture();
    const [row] = routeJsContributors(nextDir, ['/', '/']);
    expect(row.files.map(chunk => chunk.file).sort()).toEqual([
      'static/chunks/home.js',
      'static/chunks/main.js',
    ]);
    expect(Math.round(row.gzipBytes / 1024)).toBe(
      measureFirstLoadJs(nextDir).find(route => route.route === '/')?.gzipKb
    );
    expect(routeJsContributors(nextDir, [])).toEqual([]);
  });

  it('isolates fixture Git commands from an inherited parent repository', () => {
    const parentDir = buildFirstLoadFixture();
    const parentEnv = writeAncestorGitRepo(parentDir, {
      'parent.txt': 'parent',
    });
    const parentIndex = join(parentDir, '.git', 'index');
    const indexBefore = readFileSync(parentIndex);
    const git = (dir: string, env: NodeJS.ProcessEnv, args: string[]) => {
      const run = spawnSync('git', args, {
        cwd: dir,
        env,
        encoding: 'utf8',
        timeout: 10000,
      });
      expect(run.status, run.stderr).toBe(0);
      return run.stdout.trim();
    };
    const parentHead = git(parentDir, parentEnv, ['rev-parse', 'HEAD']);
    vi.stubEnv('GIT_DIR', join(parentDir, '.git'));
    vi.stubEnv('GIT_WORK_TREE', parentDir);
    vi.stubEnv('GIT_COMMON_DIR', join(parentDir, '.git'));
    vi.stubEnv('GIT_INDEX_FILE', parentIndex);

    const fixtureDir = buildFirstLoadFixture();
    const env = writeAncestorGitRepo(fixtureDir, { 'budget.json': '{}' });
    expect(env.GIT_INDEX_FILE).toBeUndefined();
    expect(env.GIT_COMMON_DIR).toBeUndefined();
    expect(git(fixtureDir, env, ['rev-parse', '--show-toplevel'])).toBe(
      fixtureDir
    );
    expect(git(fixtureDir, env, ['show', 'origin/main:budget.json'])).toBe(
      '{}'
    );
    expect(git(parentDir, parentEnv, ['rev-parse', 'HEAD'])).toBe(parentHead);
    expect(readFileSync(parentIndex)).toEqual(indexBefore);
  });

  it.each(['2024-1-5', '2024/01/05', '2099-99-99', '2099-02-30'])(
    'rejects group baseline and target raises with malformed expiry %s',
    expiresOn => {
      const input = control();
      input.budgets.groups.marketing.baselineKb = 60;
      input.routeGroups.marketing.budgets.initialJS_gzip_kb = 200;
      input.budgets.raises = {
        'groups.marketing.baselineKb': validRaise({ expiresOn }),
        'routeBudgets.marketing.initialJS_gzip_kb': validRaise({ expiresOn }),
      };
      const result = evaluateBudgets(input);
      expect(result.first.violations).toEqual([]);
      expect(result.app.violations).toEqual([]);
      expect(result.growth).toEqual([
        'groups.marketing.baselineKb grew 50 -> 60',
        'routeBudgets.marketing.initialJS_gzip_kb grew 150 -> 200',
      ]);
      expect(result.ok).toBe(false);
    }
  );

  it('rejects a target raise even when every individual route still passes', () => {
    const input = control();
    expect(evaluateBudgets(input).ok).toBe(true);
    input.routeGroups.marketing.budgets.initialJS_gzip_kb = 200;
    const result = evaluateBudgets(input);
    expect(result.first.violations).toEqual([]);
    expect(result.app.violations).toEqual([]);
    expect(result.growth).toContain(
      'routeBudgets.marketing.initialJS_gzip_kb grew 150 -> 200'
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a group overrun that remains below all individual ceilings', () => {
    const input = control();
    expect(evaluateBudgets(input).ok).toBe(true);
    input.budgets.groups.marketing.baselineKb = 10;
    const result = evaluateBudgets(input);
    expect(result.first.violations).toEqual([]);
    expect(result.app.violations).toEqual([]);
    expect(result.growth).toEqual([]);
    expect(result.ok).toBe(false);
  });

  it.each([
    { baseline: 50, status: 0 },
    { baseline: 10, status: 1 },
  ])(
    'the actual CLI exits $status for a marketing group baseline of $baseline KB',
    ({ baseline, status }) => {
      const { nextDir, budgets, budgetPath } = cliFixture();
      budgets.groups.marketing.baselineKb = baseline;
      writeFileSync(budgetPath, JSON.stringify(budgets));
      // Hermetic ancestor: the CLI compares the budgets file with origin/main
      // through git, so point git at a fixture repo holding these fixture
      // budgets instead of the real repository's baselines.
      const env = writeAncestorGitRepo(nextDir, {
        'apps/web/scripts/route-js-budgets.json': readFileSync(
          budgetPath,
          'utf8'
        ),
        'docs/performance/route-budgets.json': readFileSync(
          join(__dirname, '../../../docs/performance/route-budgets.json'),
          'utf8'
        ),
      });
      const run = runCli(nextDir, budgetPath, env);
      expect(run.status, run.stderr).toBe(status);
      const result = JSON.parse(run.stdout);
      expect(result.first.violations).toEqual([]);
      expect(result.app.violations).toEqual([]);
      expect(result.ok).toBe(status === 0);
      expect(
        result.contributors.map((row: { route: string }) => row.route)
      ).toEqual(status === 0 ? [] : ['/', '/product', '/solutions/[audience]']);
      if (status === 1) {
        expect(run.stderr).toContain('marketing group baseline is 10 KB');
        const [home] = result.contributors;
        expect(Math.round(home.gzipBytes / 1024)).toBe(
          result.first.rows.find((row: { route: string }) => row.route === '/')
            .gzipKb
        );
        expect(home.files).toHaveLength(2);
      }
    }
  );

  it.each([
    { ancestorDelta: -1, status: 1 },
    { ancestorDelta: 1, status: 0 },
  ])(
    'the real CLI compares targets with the ancestor file routes (delta $ancestorDelta)',
    ({ ancestorDelta, status }) => {
      const { nextDir, budgets, budgetPath } = cliFixture();
      writeFileSync(budgetPath, JSON.stringify(budgets));
      const ancestor = JSON.parse(
        readFileSync(
          join(__dirname, '../../../docs/performance/route-budgets.json'),
          'utf8'
        )
      );
      const currentTarget = ancestor.routes.marketing.budgets.initialJS_gzip_kb;
      ancestor.routes.marketing.budgets.initialJS_gzip_kb += ancestorDelta;
      const budgetDir = join(nextDir, 'apps/web/scripts');
      const targetDir = join(nextDir, 'docs/performance');
      mkdirSync(budgetDir, { recursive: true });
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(
        join(budgetDir, 'route-js-budgets.json'),
        JSON.stringify(budgets)
      );
      writeFileSync(
        join(targetDir, 'route-budgets.json'),
        JSON.stringify(ancestor)
      );
      const env = { ...process.env };
      for (const key of Object.keys(env)) {
        if (key.startsWith('GIT_')) delete env[key];
      }
      const emptyConfig = join(nextDir, 'empty.gitconfig');
      writeFileSync(emptyConfig, '');
      Object.assign(env, {
        GIT_CONFIG_GLOBAL: emptyConfig,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Budget fixture',
        GIT_COMMITTER_NAME: 'Budget fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      });
      const git = (args: string[]) => {
        const result = spawnSync('git', args, {
          cwd: nextDir,
          env,
          encoding: 'utf8',
          timeout: 10000,
        });
        expect(result.status, result.stderr).toBe(0);
      };
      git(['init', '--initial-branch=main']);
      git([
        'add',
        'apps/web/scripts/route-js-budgets.json',
        'docs/performance/route-budgets.json',
      ]);
      git(['commit', '-m', 'Fixture ancestor budgets']);
      git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
      const run = runCli(nextDir, budgetPath, {
        ...env,
        GIT_DIR: join(nextDir, '.git'),
        GIT_WORK_TREE: nextDir,
      });
      expect(run.status, run.stderr).toBe(status);
      const result = JSON.parse(run.stdout);
      expect(result.ok).toBe(status === 0);
      expect(result.growth).toEqual(
        status === 0
          ? []
          : [
              `routeBudgets.marketing.initialJS_gzip_kb grew ${currentTarget - 1} -> ${currentTarget}`,
            ]
      );
    }
  );
});
