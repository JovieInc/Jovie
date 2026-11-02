#!/usr/bin/env node
/**
 * `pnpm preflight:changed` (JOV-9727): run, locally and in one pass, every
 * repo rule CI would enforce on the paths this branch changes, so a PR needs
 * one CI round instead of discovering rules one 20-40 minute round at a time
 * (#23557: 7 rounds, #23524: 6).
 *
 * Covers: generators (written, not just checked), Source Validation guards
 * selected by changed path (private-data, external-api, gate-weakening,
 * metrics-layer, topology/ownership/registries, script contracts), customer
 * changelog marker, Migration Guard, changed-line coverage, lint, affected
 * typecheck under a heap cap, the PR body (Fleet Rules + a filled template of
 * anything missing) and a companion-edit checklist.
 *
 * Usage:
 *   pnpm preflight:changed [--base main] [--repo path] [--body-file f | --pr N]
 *     [--title t] [--no-coverage] [--no-typecheck] [--thorough] [--no-write]
 *     [--hook] [--list] [--json]
 *
 *   --fast      static guards only (= --no-typecheck --no-coverage)
 *   --hook      pre-push mode: honours JOVIE_PREFLIGHT_CHANGED=0, never needs a PR
 *   --thorough  also run the heavy guards deferred by default
 *   --no-write  check generators instead of writing their output
 *
 * Every run appends one JSONL row (checks red, duration) to
 * ~/.local/state/jovie-lanes/preflight-changed.jsonl; that is the
 * first-push pass-rate measurement (see scripts/lib/ci-rounds.mjs).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import {
  companionChecklist,
  explainShipGate,
  lintPrBody,
  PR_BODY_SKELETON,
  parseMergeConflicts,
} from './lib/preflight-changed.mjs';
import { checkInstallMatchesLockfile } from './lib/preflight-install.mjs';
import { remoteHint } from './lib/remote-hint.mjs';

const SELF = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAP_MB = process.env.JOVIE_PREFLIGHT_HEAP_MB || '4096';
// The web program needs more than the default (4096 OOMs); CI uses 8192.
const WEB_HEAP_MB = process.env.JOVIE_PREFLIGHT_WEB_HEAP_MB || '8192';
const CONCURRENCY = Number(process.env.JOVIE_PREFLIGHT_JOBS || 3);

/** Guards too slow for a local pass; CI still runs them (use --thorough). */
export const HEAVY_GUARDS = new Set([
  'merged-with-base-invariants',
  'lanes-selftest-changed-tests',
]);

/** Narrow a whole-suite guard to the file that actually gates a change. */
export const NARROWED = {
  'merge-group-unit-guards': {
    command:
      'node scripts/design-system-source-ratchet.mjs && pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/analytics-metrics-layer-guard.test.ts tests/unit/marketing/locked-pen-chrome-contract.test.ts tests/unit/design-system/mac-header-two-lines-v1.test.ts tests/unit/marketing/marketing-headline-line-clamp-guard.test.ts',
    note: 'source identity, metrics-layer, locked chrome and heading contracts; full suite with --thorough',
  },
};

/** Generators whose output must be committed. `write` rewrites, `check` verifies. */
export const GENERATORS = [
  {
    id: 'workflow-topology',
    when: /^\.github\/workflows\/[^/]+\.ya?ml$|^scripts\/ci-workflow-topology\.mjs$/,
    write: 'node scripts/ci-workflow-topology.mjs --write',
    check: 'node scripts/ci-workflow-topology.mjs',
  },
  {
    id: 'ci-harness-docs',
    when: /^\.github\/workflows\/|^scripts\/ci-harness\.mjs$|^docs\/ci-harness/,
    write: 'node scripts/ci-harness.mjs generate-docs --write',
    check: 'node scripts/ci-harness.mjs generate-docs --check',
  },
  {
    id: 'scoped-rule-integrity',
    when: /^\.claude\/rules\/|^scripts\/agent-context\/rule-scopes/,
    write: 'node scripts/agent-context/rule-scopes.mjs --write',
    check: 'node scripts/agent-context/rule-scopes.mjs',
  },
  {
    id: 'design-tokens-export',
    when: /^design\.tokens\.json$|^scripts\/generate-design-tokens-export\.mjs$/,
    write: 'node scripts/generate-design-tokens-export.mjs',
    check: 'node scripts/generate-design-tokens-export.mjs --check',
  },
  {
    id: 'llms-design-manifest',
    when: /^DESIGN\.md$|^design\.tokens\.json$|^scripts\/generate-llms-design-manifest\.mjs$/,
    write: 'node scripts/generate-llms-design-manifest.mjs',
    check: 'node scripts/generate-llms-design-manifest.mjs --check',
  },
];

/**
 * Tests that fail on a non-Linux host for reasons unrelated to any diff (fake
 * `gh` shims and GNU-only shell tools). Verified red on a pristine checkout;
 * CI runs them on Linux. A guard whose only reds are these is not a local red.
 */
export const HOST_RED_TESTS = new Set([
  'lib/__tests__/auto-ready-green-drafts.test.mjs',
  'lib/__tests__/pre-push-gate.test.mjs',
  'lib/__tests__/mesh-runtime-bundle.test.mjs',
  'tests/unit/db/migration-validation-script.test.ts',
]);

export function downgradeHostRed(check, result, platform = process.platform) {
  if (platform === 'linux' || !result.code || !/^guard:/.test(check.id))
    return result;
  const failed = [
    ...String(result.out).matchAll(
      /FAIL\s+\|[\w-]+\|\s+(\S+\.test\.[mc]?[jt]s)/g
    ),
  ].map(m => m[1]);
  if (failed.length && failed.every(f => HOST_RED_TESTS.has(f)))
    return {
      ...result,
      code: 0,
      skip: `host-only reds (${[...new Set(failed)].join(', ')}); CI runs Linux`,
    };
  return result;
}

export function parseArgs(argv) {
  const a = {
    base: 'main',
    repo: process.cwd(),
    coverage: true,
    typecheck: true,
    thorough: false,
    write: true,
    hook: false,
    list: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const f = argv[i];
    if (f === '--base') a.base = argv[++i];
    else if (f === '--repo') a.repo = path.resolve(argv[++i]);
    else if (f === '--body-file') a.bodyFile = argv[++i];
    else if (f === '--pr') a.pr = argv[++i];
    else if (f === '--title') a.title = argv[++i];
    else if (f === '--no-coverage') a.coverage = false;
    else if (f === '--no-typecheck') a.typecheck = false;
    else if (f === '--thorough') a.thorough = true;
    else if (f === '--fast') {
      a.coverage = false;
      a.typecheck = false;
    } else if (f === '--no-write') a.write = false;
    else if (f === '--hook') a.hook = true;
    else if (f === '--list') a.list = true;
    else if (f === '--json') a.json = true;
    else throw new Error(`unknown argument ${f}`);
  }
  return a;
}

function sh(cmd, { cwd, env, timeoutMs = 600_000 }) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn('bash', ['-c', cmd], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const take = d => {
      out += d.toString();
      if (out.length > 400_000) out = out.slice(-200_000);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: code ?? (signal ? 137 : 1),
        out,
        ms: Date.now() - t0,
      });
    });
  });
}

const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
};

/** Changed files vs the merge-base, including uncommitted and untracked. */
export function changedFiles(cwd, base) {
  const mb =
    git(cwd, ['merge-base', `origin/${base}`, 'HEAD']) ||
    git(cwd, ['rev-parse', `origin/${base}`]);
  /** @type {{filename:string, previous_filename:string|undefined, status:string, patch:string}[]} */
  const rows = git(cwd, ['diff', '--name-status', '-M', mb])
    .split('\n')
    .filter(Boolean)
    .map(row => {
      const [code, from, to] = row.split('\t');
      return {
        filename: to ?? from,
        previous_filename: to ? from : undefined,
        status: code.startsWith('A')
          ? 'added'
          : code.startsWith('D')
            ? 'removed'
            : code.startsWith('R')
              ? 'renamed'
              : 'modified',
        patch: '',
      };
    });
  const seen = new Set(rows.map(r => r.filename));
  for (const f of git(cwd, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean))
    if (!seen.has(f))
      rows.push({
        filename: f,
        previous_filename: undefined,
        status: 'added',
        patch: '',
      });
  return { mergeBase: mb, files: rows };
}

/** Run changed invariant contracts locally even when the full suite is deferred. */
export function invariantTestFiles(files, repo) {
  const tests = new Set();
  for (const file of files) {
    for (const source of [file.filename, file.previous_filename]) {
      if (!/^scripts\/invariants\/.+\.mjs$/.test(source ?? '')) continue;
      const candidate = source.replace(/(?:\.test)?\.mjs$/, '.test.mjs');
      if (existsSync(path.join(repo, candidate))) tests.add(candidate);
    }
  }
  return [...tests].sort();
}

/** GitHub reads go through the shared budgeted client (external-apis rule). */
function ghClient(cwd, ghArgs) {
  return spawnSync(
    'node',
    [
      path.join(cwd, 'packages/api-client/cli.ts'),
      'gh',
      '--priority',
      'default',
      '--',
      ...ghArgs,
    ],
    { cwd, encoding: 'utf8', timeout: 30_000 }
  );
}

function loadBody(args, cwd) {
  if (args.bodyFile)
    return {
      body: readFileSync(args.bodyFile, 'utf8'),
      title: args.title ?? '',
      labels: [],
    };
  if (
    process.env.JOVIE_PR_BODY_FILE &&
    existsSync(process.env.JOVIE_PR_BODY_FILE)
  )
    return {
      body: readFileSync(process.env.JOVIE_PR_BODY_FILE, 'utf8'),
      title: args.title ?? '',
      labels: [],
    };
  const r = ghClient(cwd, [
    'pr',
    'view',
    ...(args.pr ? [String(args.pr)] : []),
    '--json',
    'body,title,labels',
  ]);
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    return {
      body: j.body ?? '',
      title: args.title ?? j.title ?? '',
      labels: (j.labels ?? []).map(l => l.name),
    };
  } catch {
    return null;
  }
}

/** Run the shared Private Data Guard from the pinned JovieInc/ci workflow. */
async function privateDataCheck(cwd, env, mergeBase) {
  const wfPath = path.join(cwd, '.github/workflows/private-data-guard.yml');
  if (!existsSync(wfPath)) return { skip: 'no private-data-guard workflow' };
  const wf = /** @type {any} */ (yamlLoad(readFileSync(wfPath, 'utf8')));
  const job = Object.values(wf.jobs ?? {})[0] ?? {};
  const m = String(job.uses ?? '').match(/^JovieInc\/ci\/(.+)@([0-9a-f]{40})$/);
  if (!m) return { skip: 'guard is not a pinned JovieInc/ci workflow' };
  const cache = path.join(homedir(), '.cache', 'jovie-preflight');
  mkdirSync(cache, { recursive: true });
  const file = path.join(cache, `private-data-${m[2]}.py`);
  if (!existsSync(file)) {
    const r = ghClient(cwd, [
      'api',
      `repos/JovieInc/ci/contents/${m[1]}?ref=${m[2]}`,
      '--jq',
      '.content',
    ]);
    if (r.status !== 0)
      return { skip: 'could not fetch the pinned guard (gh)' };
    const yaml = Buffer.from(r.stdout.trim(), 'base64').toString('utf8');
    const py = yaml.match(/python3 - <<'PY'\n([\s\S]*?)\n\s*PY\n/);
    if (!py) return { skip: 'guard script not found in pinned workflow' };
    const lines = py[1].split('\n');
    const indent = lines[0].match(/^\s*/)[0].length;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, lines.map(l => l.slice(indent)).join('\n'));
  }
  const w = job.with ?? {};
  const head = git(cwd, ['rev-parse', 'HEAD']);
  const tmp = path.join(tmpdir(), `pdg-${process.pid}`);
  // Include uncommitted work: scan base..working tree via a temp commit-free diff
  // is not possible for the guard, so it scans committed history; commit first.
  const run = await sh(`python3 ${JSON.stringify(file)}`, {
    cwd,
    env: {
      ...env,
      EVENT_NAME: 'pull_request',
      PR_BASE_SHA: mergeBase,
      HEAD_SHA: head,
      FULL_TREE: 'false',
      FAIL_ON_FINDINGS: 'true',
      EXTRA_PATHS: w['extra-path-patterns'] ?? '',
      EXTRA_CONTENT: w['extra-content-patterns'] ?? '',
    },
    timeoutMs: 60_000,
  });
  void tmp;
  return run;
}

function biomeTargets(files) {
  return files
    .filter(
      f =>
        f.status !== 'removed' &&
        /\.(?:[cm]?[jt]sx?|json|jsonc|css)$/.test(f.filename) &&
        !/(?:^|\/)(?:drizzle\/migrations\/meta|.*\.gen\.|pnpm-lock)/.test(
          f.filename
        )
    )
    .map(f => f.filename);
}

/** Workspace packages whose typecheck the diff touches. */
export function typecheckTargets(files, cwd) {
  const out = new Set();
  for (const f of files) {
    // scripts/ is checkJs (typecheck:scripts), so .mjs/.js count there.
    const ext = /^scripts\//.test(f.filename)
      ? /\.(?:tsx?|mts|cts|mjs|js)$/
      : /\.(?:tsx?|mts|cts)$/;
    if (f.status === 'removed' || !ext.test(f.filename)) continue;
    const isTest = /\.(?:test|spec)\.[^/]+$|\/tests?\//.test(f.filename);
    const web = f.filename.startsWith('apps/web/');
    if (web) {
      out.add(isTest ? 'web-tests' : 'web');
      if (!isTest) {
        // Source changes also affect test consumers and Ovie's TS graph.
        out.add('web-tests');
        out.add('pkg:@jovie/ovie');
      }
    } else if (/^scripts\//.test(f.filename)) out.add('scripts');
    else {
      let dir = path.dirname(f.filename);
      while (dir && dir !== '.') {
        const pj = path.join(cwd, dir, 'package.json');
        if (existsSync(pj)) {
          const pkg = JSON.parse(readFileSync(pj, 'utf8'));
          if (pkg.scripts?.typecheck && pkg.name) out.add(`pkg:${pkg.name}`);
          break;
        }
        dir = path.dirname(dir);
      }
    }
  }
  return [...out];
}

function typecheckCommand(target, cwd) {
  const cap = `NODE_OPTIONS=--max-old-space-size=${target.startsWith('web') ? WEB_HEAP_MB : HEAP_MB}`;
  if (target === 'web')
    return `cd apps/web && ${cap} pnpm exec node ../../scripts/typecheck-singleflight.mjs -- tsc -p tsconfig.typecheck.json --noEmit --incremental --tsBuildInfoFile .cache/tsbuildinfo`;
  if (target === 'web-tests')
    return `cd apps/web && ${cap} node ../../scripts/typecheck-singleflight.mjs -- node ../../scripts/typecheck-web-tests.mjs`;
  if (target === 'scripts') return `${cap} pnpm typecheck:scripts`;
  return `${cap} pnpm --filter ${target.slice(4)} run typecheck`;
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  log = console.log,
} = {}) {
  const args = parseArgs(argv);
  if (args.hook && env.JOVIE_PREFLIGHT_CHANGED === '0') {
    log('[preflight:changed] skipped (JOVIE_PREFLIGHT_CHANGED=0)');
    return 0;
  }
  const cwd = args.repo;
  const hint = remoteHint({ env });
  if (hint) log(hint);
  // Fail fast before any check runs against an install this worktree did not make.
  const install = checkInstallMatchesLockfile({ repo: cwd });
  if (!install.ok) {
    log(`[preflight:changed] ${install.message}`);
    return 1;
  }
  const started = Date.now();
  const childEnv = { ...env };
  for (const k of Object.keys(childEnv))
    if (/^GIT_/.test(k)) delete childEnv[k];
  // Gates refuse the ambient Node when it violates engines (same pin preflight.mjs uses).
  const pinned = spawnSync('bash', ['scripts/hooks/resolve-repo-node.sh'], {
    cwd,
    env: childEnv,
    encoding: 'utf8',
  });
  if (pinned.status === 0 && pinned.stdout.trim())
    childEnv.PATH = `${pinned.stdout.trim()}:${childEnv.PATH}`;
  Object.assign(childEnv, {
    NODE_OPTIONS: `--max-old-space-size=${HEAP_MB}`,
    GITHUB_BASE_REF: args.base,
    GITHUB_EVENT_NAME: 'pull_request',
    CI_BASE_REF: `origin/${args.base}`,
    // Copied guards compare their module URL to argv[1]; macOS /var -> /private/var
    // aliases turn their real checks into silent no-ops or false reds.
    TMPDIR: realpathSync(env.TMPDIR || tmpdir()),
  });
  spawnSync('git', ['fetch', '--no-tags', '-q', 'origin', args.base], { cwd });
  const { mergeBase, files } = changedFiles(cwd, args.base);
  childEnv.SHADCN_LINT_DIFF_BASE = mergeBase;
  const paths = files.map(f => f.filename);
  if (!paths.length) {
    log('[preflight:changed] no changes vs origin/' + args.base);
    return 0;
  }
  const readFile = p => {
    try {
      return readFileSync(path.join(cwd, p), 'utf8');
    } catch {
      return '';
    }
  };
  const migrationChanged = paths.some(p =>
    /^apps\/web\/(?:drizzle\/|scripts\/(?:check-migrations|validate-migrations)\.sh|scripts\/online-index-migrate\.ts)/.test(
      p
    )
  );

  /** @type {{id:string,name:string,run:()=>Promise<any>,phase:number}[]} */
  const checks = [];
  const add = (id, name, run, phase = 1) =>
    checks.push({ id, name, run, phase });
  const cmd = (id, name, command, phase = 1, timeoutMs) =>
    add(id, name, () => sh(command, { cwd, env: childEnv, timeoutMs }), phase);

  // Phase 0: generators write first so later checks see fresh output.
  for (const g of GENERATORS) {
    if (!paths.some(p => g.when.test(p))) continue;
    cmd(
      `gen:${g.id}`,
      `generator ${g.id} (${args.write ? 'write' : 'check'})`,
      args.write ? g.write : g.check,
      0
    );
  }

  // Phase 1: source guards selected by changed path, from the repo's own list.
  const lanes = await import(
    pathToFileURL(path.join(cwd, 'scripts/ci-fast-lanes.mjs')).href
  );
  const deferred = [];
  for (const guard of lanes.selectSourceGuards('pull_request', paths)) {
    if (HEAVY_GUARDS.has(guard.id) && !args.thorough) {
      deferred.push(guard.id);
      continue;
    }
    const narrow = !args.thorough && NARROWED[guard.id];
    cmd(
      `guard:${guard.id}`,
      `source guard ${guard.id}${narrow ? ` [${narrow.note}]` : ''}`,
      narrow ? narrow.command : guard.command
    );
  }

  const invariantTests = invariantTestFiles(files, cwd);
  if (invariantTests.length)
    cmd(
      'invariant-tests',
      `changed invariant contracts (${invariantTests.length} files)`,
      `node --test ${invariantTests.map(f => `'${f.replaceAll("'", "'\\''")}'`).join(' ')}`
    );

  const any = re => paths.some(p => re.test(p));
  // Source Validation guards come from one manifest (see
  // scripts/lib/source-validation-manifest.mjs); a test keeps it equal to the workflow.
  const manifest = await import(
    pathToFileURL(path.join(cwd, 'scripts/lib/source-validation-manifest.mjs'))
      .href
  );
  for (const g of manifest.selectManifestGuards(paths, args.base)) {
    if (g.heavy && !args.thorough) {
      deferred.push(g.id);
      continue;
    }
    cmd(g.id, g.name, g.command, g.phase ?? 1);
  }

  const bio = biomeTargets(files);
  if (bio.length)
    cmd(
      'biome',
      `biome check (${bio.length} files)`,
      `pnpm exec biome check --no-errors-on-unmatched ${bio.map(f => JSON.stringify(f)).join(' ')}`
    );

  // Merge-with-base: Source Validation judges the merged tree. Warn-only.
  add('merge-base', 'merges cleanly with origin/' + args.base, async () => {
    const r = await sh(
      `git merge-tree --write-tree --name-only origin/${args.base} HEAD`,
      { cwd, env: childEnv, timeoutMs: 60_000 }
    );
    if (r.code === 0) return r;
    const conflicts = parseMergeConflicts(r.out);
    return {
      ...r,
      code: 0,
      warn: `does not merge cleanly with origin/${args.base}; resolve before pushing${conflicts.length ? `: ${conflicts.join(', ')}` : ''}`,
    };
  });

  // Component ship gate: adjacent story, named test touched (JOV-4421).
  if (any(/^(?:apps\/web\/components\/|packages\/ui\/).+\.tsx$/))
    add(
      'ship-gate',
      'component ship gate (story + test per changed component)',
      async () => {
        const r = await sh(
          `node scripts/component-ship-gate.mjs --diff-base=${mergeBase} --skip-rendered-cert --skip-live-storybook`,
          { cwd, env: childEnv, timeoutMs: 300_000 }
        );
        const todo = explainShipGate(r.out);
        return todo.length ? { ...r, out: `${todo.join('\n')}\n${r.out}` } : r;
      }
    );

  // Customer changelog marker, Fleet Rules and template: needs the body.
  const bodyInfo = loadBody(args, cwd);

  // Migration Guard.
  if (migrationChanged) {
    cmd(
      'migration',
      'Migration Guard',
      `cd apps/web && ./scripts/check-migrations.sh origin/${args.base} && ./scripts/validate-migrations.sh && pnpm exec tsx scripts/online-index-migrate.ts --validate-only`
    );
    add('migration-lint', 'migration SQL lint (squawk)', async () => {
      const r = await sh(
        `node scripts/db/lint-changed-migrations.mjs --base ${mergeBase}`,
        { cwd, env: childEnv }
      );
      // Squawk ships linux binaries only; CI still runs it. Not a local red.
      if (/Squawk install supports linux/.test(r.out))
        return {
          ...r,
          code: 0,
          skip: 'squawk needs linux (set SQUAWK_BIN to run)',
        };
      return r;
    });
  }

  // Private data guard (needs committed work; it scans base..HEAD).
  add('private-data', 'private data guard', () =>
    privateDataCheck(cwd, childEnv, mergeBase)
  );

  // Coverage on changed lines (60% min), related tests only.
  if (args.coverage && any(/^apps\/web\//)) {
    add(
      'coverage',
      'exact-head coverage on changed lines',
      async () => {
        const head = git(cwd, ['rev-parse', 'HEAD']);
        const plan = await sh(
          `node scripts/check-changed-test-coverage.mjs --base ${mergeBase} --head ${head} --plan`,
          { cwd, env: childEnv }
        );
        let parsed;
        try {
          parsed = JSON.parse(plan.out.trim().split('\n').pop());
        } catch {
          return { code: 1, out: plan.out, ms: plan.ms };
        }
        if (!parsed.applicable)
          return {
            skip: 'no coverable web product source',
            code: 0,
            out: '',
            ms: plan.ms,
          };
        const e = {
          ...childEnv,
          JOVIE_COVERAGE_INCLUDE: (parsed.coverageInclude ?? []).join('\n'),
          JOVIE_COVERAGE_RELATED_TESTS: (parsed.relatedTests ?? []).join('\n'),
        };
        const run = await sh(
          `pnpm --filter @jovie/web test:coverage --changed ${mergeBase} --bail 1 --testTimeout=60000 --retry=1 && node scripts/check-changed-test-coverage.mjs --base ${mergeBase} --head ${head} --coverage apps/web/coverage/coverage-final.json`,
          { cwd, env: e, timeoutMs: 900_000 }
        );
        return {
          ...run,
          ms: run.ms + plan.ms,
          note: 'covers committed lines; commit first',
        };
      },
      2
    );
  }

  // Typecheck affected packages only, heap capped.
  if (args.typecheck)
    for (const t of typecheckTargets(files, cwd))
      add(
        `tsc:${t}`,
        `typecheck ${t}`,
        async () => {
          const r = await sh(typecheckCommand(t, cwd), {
            cwd,
            env: childEnv,
            timeoutMs: 900_000,
          });
          // An OOM is no verdict on the code; say how to raise the cap.
          if (r.code !== 0 && /heap out of memory/.test(r.out))
            return {
              ...r,
              code: 0,
              skip: `out of memory at the heap cap; set JOVIE_PREFLIGHT_WEB_HEAP_MB / JOVIE_PREFLIGHT_HEAP_MB higher, or let CI run it`,
            };
          return r;
        },
        2
      );

  if (args.list) {
    for (const c of checks) log(`run  ${c.id}  ${c.name}`);
    for (const d of deferred) log(`defer  guard:${d}  (heavy; --thorough)`);
    return 0;
  }

  // Run phases in order; within a phase, a bounded pool.
  const results = [];
  for (const phase of [0, 1, 2]) {
    const queue = checks.filter(c => c.phase === phase);
    const worker = async () => {
      while (queue.length) {
        const c = queue.shift();
        const r = downgradeHostRed(c, await c.run());
        const status = r.skip
          ? 'skip'
          : r.warn
            ? 'warn'
            : r.code === 0
              ? 'ok'
              : 'FAIL';
        log(
          `  ${status.padEnd(4)}  ${c.name} (${((r.ms ?? 0) / 1000).toFixed(1)}s)${r.skip ? `  [${r.skip}]` : ''}`
        );
        results.push({ ...c, ...r, status });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (phase === 0 && args.write && results.length) {
      // Commit hooks (lint-staged) format staged files; match that so the
      // generated output is committable as written.
      const touched = git(cwd, ['diff', '--name-only'])
        .split('\n')
        .filter(f => /\.(?:[cm]?[jt]sx?|json)$/.test(f));
      if (touched.length)
        await sh(
          `pnpm exec biome check --write --no-errors-on-unmatched ${touched.map(f => JSON.stringify(f)).join(' ')}`,
          { cwd, env: childEnv }
        );
    }
    if (phase === 0 && args.write) {
      const changedByGen = git(cwd, ['status', '--porcelain'])
        .split('\n')
        .filter(l => /workflow-topology|ci-harness|design-tokens|llms/.test(l));
      if (changedByGen.length)
        log(
          `  note  generators wrote output; stage and commit:\n        ${changedByGen.join('\n        ')}`
        );
    }
  }

  // PR body.
  let body = { errors: [], warnings: [], template: '' };
  if (bodyInfo) {
    const { evaluateFleetRules } = await import(
      pathToFileURL(path.join(cwd, 'scripts/pr-fleet-rules.mjs')).href
    );
    body = lintPrBody({ ...bodyInfo, files, evaluateFleetRules });
  } else {
    body.warnings.push({
      id: 'no-pr-body',
      message:
        'no PR body found (no --body-file, JOVIE_PR_BODY_FILE or open PR); paste this skeleton into the PR you open',
    });
    body.template = PR_BODY_SKELETON;
  }

  const companion = companionChecklist(files, readFile).filter(i => !i.done);

  log('\n== preflight:changed summary');
  const red = results.filter(r => r.status === 'FAIL');
  for (const w of results.filter(r => r.warn)) log(`\n[~] ${w.warn}`);
  for (const r of red) {
    log(`\n[ ] ${r.name}`);
    const lines = r.out.split('\n').filter(Boolean);
    const loud = lines.filter(l =>
      /fail|error|violation|missing|✗|×|TS\d{4}|not registered/i.test(l)
    );
    for (const l of (loud.length ? loud : lines).slice(-14))
      log(`      ${l.slice(0, 220)}`);
  }
  for (const e of body.errors) log(`\n[ ] PR body: ${e.message}`);
  for (const w of body.warnings) log(`\n[~] PR body: ${w.message}`);
  for (const c of companion)
    log(`\n[ ] companion edit (${c.trigger}): ${c.item}\n      ${c.hint}`);
  if (body.template) log(`\nPaste into the PR body:\n\n${body.template}\n`);
  for (const d of deferred)
    log(`  deferred  guard:${d} (heavy; rerun with --thorough)`);

  const total = red.length + body.errors.length + companion.length;
  log(total ? `\n${total} item(s) to fix before pushing.` : '\nall clear.');

  if (env.JOVIE_PREFLIGHT_LEDGER !== 'off') {
    try {
      const dir =
        env.JOVIE_PREFLIGHT_LEDGER_DIR ||
        path.join(homedir(), '.local', 'state', 'jovie-lanes');
      mkdirSync(dir, { recursive: true });
      appendFileSync(
        path.join(dir, 'preflight-changed.jsonl'),
        `${JSON.stringify({
          at: new Date().toISOString(),
          head: git(cwd, ['rev-parse', 'HEAD']),
          durationMs: Date.now() - started,
          checks: results.length,
          red: [
            ...red.map(r => r.id),
            ...body.errors.map(e => `body:${e.id}`),
            ...companion.map(c => `companion:${c.item}`),
          ],
        })}\n`
      );
    } catch {
      // measurement must never fail the gate
    }
  }
  if (args.json)
    log(
      JSON.stringify({ red: red.map(r => r.id), body: body.errors, companion })
    );
  return total ? 1 : 0;
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
)
  process.exitCode = await main();
void SELF;
