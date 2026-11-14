import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  evaluateBudgets,
  grownBudgetNumbers,
  HEADROOM_KB,
  measureFirstLoadJs,
} from './route-js-budget.mjs';

export const fixtureRoots: string[] = [];
export function cleanupFixtures() {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
}

/** Incompressible bytes so gzip size tracks the byte count. */
export function writeChunk(nextDir: string, name: string, bytes: number) {
  const path = join(nextDir, 'static', 'chunks', name);
  mkdirSync(join(nextDir, 'static', 'chunks'), { recursive: true });
  writeFileSync(path, randomBytes(bytes));
  return `static/chunks/${name}`;
}

export const NOW = new Date('2026-10-22T00:00:00.000Z');

export function firstLoadBudgets(
  groups?: Record<string, { baselineKb: number }>
) {
  return {
    defaultMaxGzipKb: 900,
    routes: { '/app/chat': 1385 } as Record<string, number>,
    firstLoad: {
      headroomKb: HEADROOM_KB,
      marketingMaxGzipKb: 32,
      defaultMaxGzipKb: 80,
      marketingRoutes: ['/', '/product', '/solutions/*'],
      routes: { '/': 32, '/product': 32 } as Record<string, number>,
      // Every measured route needs its own baseline: there is no default.
      baselines: {
        '/': 32,
        '/product': 32,
        '/solutions/[audience]': 32,
        '/about': 80,
      } as Record<string, number>,
    },
    raises: {} as Record<string, ReturnType<typeof validRaise>>,
    groups: (groups ?? {}) as Record<string, { baselineKb: number }>,
  };
}

export function validRaise(overrides: Record<string, string> = {}) {
  return {
    owner: '@jovie',
    reason: 'Measured first-load JS exceeded the previous ceiling',
    issue: 'JOV-1001',
    removalCondition: 'Split the route chunk and lower the ceiling',
    evidence: 'apps/web/scripts/route-js-budget.test.ts',
    ...overrides,
  };
}

export function judge(
  budgets: ReturnType<typeof firstLoadBudgets>,
  firstRows: ReturnType<typeof measureFirstLoadJs>,
  ancestor: ReturnType<typeof firstLoadBudgets> = budgets
) {
  return evaluateBudgets({
    appRows: [],
    firstRows,
    budgets,
    ancestor,
    now: NOW,
  });
}

export function growth(next: object, previous: object) {
  return grownBudgetNumbers(next, previous, NOW).join('\n');
}

export function buildFirstLoadFixture() {
  const nextDir = mkdtempSync(join(tmpdir(), 'first-load-js-'));
  fixtureRoots.push(nextDir);
  const main = writeChunk(nextDir, 'main.js', 8 * 1024);
  const home = writeChunk(nextDir, 'home.js', 8 * 1024);
  const product = writeChunk(nextDir, 'product.js', 8 * 1024);
  const about = writeChunk(nextDir, 'about.js', 40 * 1024);
  writeFileSync(
    join(nextDir, 'build-manifest.json'),
    JSON.stringify({ rootMainFiles: [main], polyfillFiles: [] })
  );
  writeFileSync(
    join(nextDir, 'app-build-manifest.json'),
    JSON.stringify({
      pages: {
        '/page': [main, home],
        '/product/page': [main, product],
        '/about/page': [main, about],
        '/solutions/[audience]/page': [main, product],
        '/app/(shell)/chat/page': [main, about],
      },
    })
  );
  return nextDir;
}

/**
 * The CLI proves budgets only shrink by diffing the budgets file against
 * origin/main through git, so a hermetic CLI test needs a fixture repo —
 * never the real repository's ancestor. Writes `files` (fixture-relative
 * paths), commits them as origin/main, and returns the env that redirects
 * the CLI's git calls at the fixture repo.
 */
export function writeAncestorGitRepo(
  nextDir: string,
  files: Record<string, string>
): NodeJS.ProcessEnv {
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(nextDir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  const emptyConfig = join(nextDir, 'empty.gitconfig');
  writeFileSync(emptyConfig, '');
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  Object.assign(env, {
    GIT_NO_LAZY_FETCH: '1',
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Budget fixture',
    GIT_COMMITTER_NAME: 'Budget fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  });
  const git = (args: string[]): void => {
    const result = spawnSync('git', args, {
      cwd: nextDir,
      env,
      encoding: 'utf8',
      timeout: 10000,
    });
    if (result.status !== 0) {
      throw new Error(`fixture git ${args.join(' ')} failed: ${result.stderr}`);
    }
  };
  git(['init', '--initial-branch=main']);
  git(['add', '.']);
  git(['commit', '--no-gpg-sign', '-m', 'Fixture ancestor budgets']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  return {
    ...env,
    GIT_DIR: join(nextDir, '.git'),
    GIT_WORK_TREE: nextDir,
  };
}
