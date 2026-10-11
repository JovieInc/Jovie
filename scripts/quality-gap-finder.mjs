#!/usr/bin/env node
/**
 * Quality gap finder: proposes missing tests, guardrails, and invariants from
 * repo and tracker evidence. Deterministic and model-free; one filesystem
 * walk, one `git log`, and at most four Linear queries per run.
 * Invariant consumer: JOV-INV-041.
 *
 * Collectors (each returns proposals with a confidence in [0, 1]):
 *   invariant-evidence-unwired   canon invariant whose enforcing test no CI
 *                                command runs, or a non-adopted invariant
 *                                with no enforcing test
 *   postmortem-class-unguarded   post-mortem failure class with no registered
 *                                invariant, incident ledger entry, or script
 *   escaped-defect-untested      bug/dogfood/Sentry issue naming a source file
 *                                that has no test
 *   escaped-defect-closure-unverified
 *                                completed escaped defect missing product +
 *                                detector closure evidence
 *   component-state-untested     recently changed UI component with neither a
 *                                story nor a test
 *   changed-code-untested        recently changed API route / lib module with
 *                                no test
 *   coverage-evidence-stale      coverage heatmap older than 30 days, and
 *                                per-module coverage drops when a summary and
 *                                baseline are supplied
 *   route-budget-missing         public route with no performance budget
 *
 * Routing (see docs/quality/QUALITY_GAP_FINDER.md):
 *   confidence >= 0.75 -> Linear Backlog issue, label `quality-gap`
 *                         (+ `agent-ready` when the fix is mechanical)
 *   confidence <  0.75 -> Linear Backlog issue, label `quality-gap:needs-tim`;
 *                         Summer turns these into Ovie inbox cards.
 * Dedupe: a stable `[qg-xxxxxxxx]` fingerprint in the title. Any existing
 * issue with the fingerprint (open, done, or canceled) suppresses the
 * proposal, so a canceled card is Tim's durable "no".
 * Caps: at most MAX_HIGH_PER_RUN new high-confidence issues per run and
 * MAX_LOW_PER_DAY new needs-tim issues per UTC day.
 *
 * Usage:
 *   node scripts/quality-gap-finder.mjs                 # dry run, JSON report
 *   node scripts/quality-gap-finder.mjs --file          # file to Linear
 *   --linear-issues <json>   offline escaped-defect input (array of issues)
 *   --action-states <json>   offline post-mortem action states ({id: type})
 *   --coverage-summary <json> --coverage-baseline <json>
 *   --since-days <n>         git window (default 14)
 *   --out <path>             also write the JSON report
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedHere } from './invariants/registry.mjs';
import {
  ESCAPED_DEFECT_LABEL,
  evaluateEscapedDefectClosure,
} from './lib/escaped-defect-closure.mjs';
import {
  JOVIE_TEAM_ID,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';

export const REPORT_SCHEMA = 'jovie.quality-gap-report/v1';
export const HIGH_CONFIDENCE = 0.75;
/** Below this a proposal is noise, not a judgment call for Tim. */
export const MIN_CONFIDENCE = 0.5;
export const MAX_HIGH_PER_RUN = 5;
export const MAX_LOW_PER_DAY = 3;
export const LABEL_HIGH = 'quality-gap';
export const LABEL_LOW = 'quality-gap:needs-tim';
export const LABEL_AGENT_READY = 'agent-ready';
export const HEATMAP_STALE_DAYS = 30;
export const COVERAGE_DROP_PP = 3;
export const PER_COLLECTOR_LIMIT = 5;
export const DEFECT_LABELS = Object.freeze([
  'bug',
  'dogfood',
  'sentry',
  'intake',
  'escaped-defect',
]);

const DEFAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mjs', '.js']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'generated',
  'storybook-static',
  '.turbo',
]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const STORY_FILE = /\.stories\.[cm]?[jt]sx?$/;
const NON_PUBLIC_ROUTE =
  /^\/(?:api|app|admin|exp|dev|demo|ui|renders|hud|sandbox|test|internal|signin|signup|sign-in|sign-up|auth|onboarding|start|claim|account|settings|billing|investor-portal)(?:\/|$)/;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function fingerprintOf(kind, key) {
  return `qg-${createHash('sha256').update(`${kind}:${key}`).digest('hex').slice(0, 8)}`;
}

function proposal({
  kind,
  key,
  title,
  confidence,
  impact = 1,
  mechanical = false,
  area,
  evidence,
  suggestion,
  originatingIssue = null,
}) {
  return {
    fingerprint: fingerprintOf(kind, key),
    kind,
    key,
    title,
    confidence: Math.round(confidence * 100) / 100,
    impact,
    mechanical,
    area,
    evidence,
    suggestion,
    originatingIssue,
  };
}

function posix(path) {
  return path.split('\\').join('/');
}

function readText(repoRoot, rel) {
  const abs = resolve(repoRoot, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function walk(absDir, out, filter) {
  if (!existsSync(absDir)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.storybook') continue;
    const next = join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(next, out, filter);
    } else if (filter(entry.name)) {
      out.push(next);
    }
  }
}

function listFiles(repoRoot, roots, filter) {
  const out = [];
  for (const root of roots) walk(resolve(repoRoot, root), out, filter);
  return out.map(abs => posix(relative(repoRoot, abs))).sort();
}

const CODE_EXT = /\.(?:tsx?|mjs|cjs|jsx?)$/;

function stem(relPath) {
  return basename(relPath).replace(CODE_EXT, '');
}

/** `@/lib/a/b.server` or `../../lib/a/b.server.ts` -> `lib/a/b.server`. */
function importTail(specifier) {
  return specifier
    .replace(/^@\//, '')
    .replace(/^(?:\.\.?\/)+/, '')
    .replace(CODE_EXT, '');
}

/**
 * Index of test evidence, built once per run: test base names anywhere in
 * the tree, sibling test paths, and the tail of every module a test imports
 * or mocks. Matching errs toward "tested" so proposals stay precise.
 */
export function buildTestIndex(repoRoot = DEFAULT_ROOT) {
  const testFiles = listFiles(
    repoRoot,
    ['apps/web', 'packages', 'scripts'],
    name => TEST_FILE.test(name)
  );
  const siblingStems = new Set();
  const testStems = new Set();
  const importTails = new Set();
  for (const rel of testFiles) {
    const name = basename(rel).replace(TEST_FILE, '');
    siblingStems.add(`${dirname(rel)}/${name}`);
    testStems.add(name);
    const source = readText(repoRoot, rel);
    for (const match of source.matchAll(
      /(?:from\s+|import\(\s*|vi\.mock\(\s*|require\(\s*)['"]([^'"]+)['"]/g
    )) {
      if (match[1].includes('/')) importTails.add(importTail(match[1]));
    }
  }
  // One-hop reverse imports for web source, so a module exercised through a
  // tested entrypoint (proxy.ts -> lib/auth/proxy-request-handler) counts.
  const importers = new Map();
  for (const rel of listFiles(
    repoRoot,
    ['apps/web'],
    name =>
      /\.(?:tsx?|mjs)$/.test(name) &&
      !TEST_FILE.test(name) &&
      !STORY_FILE.test(name)
  )) {
    if (/\/(?:tests|e2e|\.storybook)\//.test(rel)) continue;
    for (const match of readText(repoRoot, rel).matchAll(
      /(?:from\s+|import\(\s*)['"](@\/[^'"]+)['"]/g
    )) {
      const tail = importTail(match[1]);
      const list = importers.get(tail) ?? [];
      list.push(rel);
      importers.set(tail, list);
    }
  }
  return { testFiles, siblingStems, testStems, importTails, importers };
}

function moduleTail(relPath) {
  return relPath
    .replace(/^apps\/[^/]+\//, '')
    .replace(/^packages\/[^/]+\//, '')
    .replace(CODE_EXT, '');
}

export function hasTest(relPath, index, depth = 1) {
  if (hasDirectTest(relPath, index)) return true;
  if (depth <= 0) return false;
  const importers = index.importers?.get(moduleTail(relPath)) ?? [];
  return importers.some(importer => hasDirectTest(importer, index));
}

function hasDirectTest(relPath, index) {
  const base = `${dirname(relPath)}/${stem(relPath)}`;
  if (index.siblingStems.has(base)) return true;
  const name = stem(relPath);
  const generic = ['route', 'page', 'index', 'layout'].includes(name);
  if (!generic && index.testStems.has(name)) return true;
  // `apps/web/lib/auth/x.server.ts` -> `lib/auth/x.server`
  const tail = moduleTail(relPath);
  // A directory module (`lib/ovie/shipping-state/*`) tested through its
  // barrel or a test named after the directory.
  const dirTail = dirname(tail);
  const dirName = basename(dirTail);
  if (
    index.importTails.has(dirTail) ||
    [...index.testStems].some(
      testStem => testStem === dirName || testStem.startsWith(`${dirName}.`)
    )
  )
    return true;
  for (const spec of index.importTails) {
    if (spec === tail || tail.endsWith(`/${spec}`) || spec.endsWith(`/${tail}`))
      return true;
  }
  if (generic) {
    // `app/api/auth/native/handback/route.ts` is often tested as
    // `native-handback.test.ts`; accept a test named after its segments.
    const segments = dirname(tail).split('/').filter(Boolean).slice(-2);
    const joined = segments.join('-');
    if (
      joined &&
      [...index.testStems].some(testStem => testStem.includes(joined))
    )
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// collectors
// ---------------------------------------------------------------------------

export function readInvariants(repoRoot = DEFAULT_ROOT) {
  return readText(repoRoot, 'canon/invariants.jsonl')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(item => typeof item.id === 'string');
}

/**
 * Directory prefixes that a Vitest config includes by glob, so a test under
 * them runs without being named anywhere (`scripts/lib/__tests__/**`).
 */
export function readRunnerIncludePrefixes(repoRoot = DEFAULT_ROOT) {
  const configs = listFiles(
    repoRoot,
    ['scripts', 'apps/web', 'packages'],
    name => /^vitest\.config[^/]*\.m?[jt]s$/.test(name)
  );
  const prefixes = [];
  for (const rel of configs) {
    const source = readText(repoRoot, rel);
    for (const block of source.matchAll(/include:\s*\[([^\]]*)\]/g)) {
      for (const glob of block[1].matchAll(/['"]([^'"]+)['"]/g)) {
        const head = glob[1].split('*')[0].replace(/^\.\//, '');
        prefixes.push(`${dirname(rel)}/${head}`.replace(/\/+/g, '/'));
      }
    }
  }
  return [...new Set(prefixes)];
}

export function readCiSources(repoRoot = DEFAULT_ROOT) {
  const workflows = listFiles(repoRoot, ['.github/workflows'], name =>
    /\.ya?ml$/.test(name)
  );
  return [
    'package.json',
    'scripts/ci-fast-lanes.mjs',
    'apps/web/package.json',
    ...workflows,
  ]
    .map(rel => readText(repoRoot, rel))
    .join('\n');
}

/** Invariants whose enforcing test no CI command runs, or has no test. */
export function collectInvariantGaps(
  invariants,
  ciSources,
  runnerPrefixes = []
) {
  const out = [];
  for (const invariant of invariants) {
    const state = invariant.lifecycle?.state;
    if (state === 'superseded' || state === 'retired') continue;
    const tests = [
      ...(invariant.evidence?.tests ?? []),
      ...(invariant.evidence?.deliberateRed ?? []),
    ];
    if (tests.length === 0) {
      out.push(
        proposal({
          kind: 'invariant-evidence-unwired',
          key: `${invariant.id}:no-test`,
          title: `${invariant.id} has no enforcing test (${state ?? 'unknown state'})`,
          confidence: 0.85,
          impact: 3,
          area: 'invariants',
          evidence: [
            `canon/invariants.jsonl ${invariant.id}: "${invariant.title}" lists no evidence tests or deliberate-red proof`,
          ],
          suggestion:
            'Add an executable check plus a deliberate-red fixture, bind them in the registry, and adopt the invariant (JOV-INV-004).',
        })
      );
      continue;
    }
    // Evidence owned by another repo (e.g. JovieInc/symphony-control) is
    // verified by that repo's CI against the same canon, not wired here.
    const localPaths = new Set(
      tests.filter(test => ownedHere(test)).map(test => test.path)
    );
    for (const path of localPaths) {
      if (ciSources.includes(path)) continue;
      // A directory glob (`scripts/verification/*.test.mjs`) may run it.
      if (ciSources.includes(`${dirname(path)}/*`)) continue;
      if (runnerPrefixes.some(prefix => path.startsWith(prefix))) continue;
      if (/\/tests\/e2e\/|\/tests\/unit\//.test(path)) continue;
      out.push(
        proposal({
          kind: 'invariant-evidence-unwired',
          key: `${invariant.id}:${path}`,
          title: `${invariant.id} evidence ${basename(path)} is not run by any CI command`,
          confidence: 0.85,
          impact: 3,
          mechanical: true,
          area: 'invariants',
          evidence: [
            `${invariant.id} cites ${path}, but no workflow, package script, or ci-fast lane names it`,
          ],
          suggestion: `Wire ${path} into pnpm invariants:check (or its owning lane) so the invariant fails closed in CI.`,
        })
      );
    }
  }
  return out;
}

function frontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const value = kv[2].trim();
    data[kv[1]] = value.startsWith('[')
      ? value
          .slice(1, -1)
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      : value;
  }
  return data;
}

export function readPostmortems(repoRoot = DEFAULT_ROOT) {
  const dir = resolve(repoRoot, 'docs/postmortems');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => /^\d{4}-\d{2}.*\.md$/.test(name))
    .map(name => {
      const rel = `docs/postmortems/${name}`;
      const source = readText(repoRoot, rel);
      const meta = frontmatter(source);
      let classes = Array.isArray(meta.failure_classes)
        ? meta.failure_classes
        : [];
      if (classes.length === 0) {
        // Older post-mortems list classes in a table, not frontmatter.
        const index = readText(repoRoot, 'docs/postmortems/README.md');
        const row = index.split('\n').find(line => line.includes(`(${name})`));
        classes = [...(row ?? '').matchAll(/`([a-z0-9-]+)`/g)].map(m => m[1]);
      }
      const actions = Array.isArray(meta.actions)
        ? meta.actions.filter(action => /^[A-Z]+-\d+$/.test(action))
        : [];
      return { path: rel, classes, actions };
    });
}

/**
 * Post-mortem failure classes with no invariant, ledger entry, or script.
 * A class is still being handled while its post-mortem lists open
 * `postmortem-action` issues; it becomes a gap when there are no actions or
 * every action is closed and still nothing names the class. `actionStates`
 * maps an action id to its Linear state type when the tracker is reachable.
 */
export function collectPostmortemGaps(
  postmortems,
  guardCorpus,
  actionStates = null
) {
  const seen = new Map();
  for (const postmortem of postmortems) {
    for (const cls of postmortem.classes) {
      const entry = seen.get(cls) ?? { paths: [], actions: [] };
      entry.paths.push(postmortem.path);
      entry.actions.push(...(postmortem.actions ?? []));
      seen.set(cls, entry);
    }
  }
  const out = [];
  for (const [cls, { paths, actions }] of seen) {
    if (guardCorpus.includes(cls)) continue;
    const closedTypes = ['completed', 'canceled'];
    const actionsClosed =
      actions.length > 0 &&
      actionStates !== null &&
      actions.every(action => closedTypes.includes(actionStates[action]));
    if (actions.length > 0 && !actionsClosed) continue;
    const recurring = paths.length >= 2 || actionsClosed;
    out.push(
      proposal({
        kind: 'postmortem-class-unguarded',
        key: cls,
        title: `Post-mortem failure class \`${cls}\` has no registered guardrail`,
        // A recurring class earns a class-level hardening issue by policy
        // (docs/postmortems/README.md); a one-off needs judgment.
        confidence: recurring ? 0.8 : 0.55,
        impact: 4,
        area: 'postmortems',
        evidence: [
          `seen in ${paths.length} post-mortem(s): ${paths.join(', ')}`,
          actionsClosed
            ? `every postmortem-action (${actions.join(', ')}) is closed`
            : 'the post-mortem lists no postmortem-action issues',
          'no canon invariant, CI incident ledger entry, or script names this class',
        ],
        suggestion: `Register an invariant or guardrail for \`${cls}\` that covers every similar surface, with a deliberate-red proof.`,
      })
    );
  }
  return out;
}

const PATH_IN_TEXT =
  /(?:^|[\s`'"(])((?:apps\/[a-z-]+\/|packages\/[a-z-]+\/)?(?:app|components|lib|hooks|atoms|scripts)\/[\w@()[\]./-]+\.(?:tsx|ts|mjs|css))/g;

/** Escaped defects that name a source file with no test. */
export function collectEscapedDefectGaps(issues, repoRoot, testIndex) {
  const out = [];
  for (const issue of issues) {
    const labels = (issue.labels ?? []).map(label =>
      String(label).toLowerCase()
    );
    if (!labels.some(label => DEFECT_LABELS.includes(label))) continue;
    const text = `${issue.title ?? ''}\n${issue.description ?? ''}`;
    const paths = new Set();
    for (const match of text.matchAll(PATH_IN_TEXT)) {
      const raw = match[1];
      const candidates =
        raw.startsWith('apps/') || raw.startsWith('packages/')
          ? [raw]
          : [`apps/web/${raw}`, `packages/ui/${raw}`];
      const found = candidates.find(rel => existsSync(resolve(repoRoot, rel)));
      if (found && !TEST_FILE.test(found) && !STORY_FILE.test(found))
        paths.add(found);
    }
    for (const path of paths) {
      if (hasTest(path, testIndex)) continue;
      const closed = ['completed', 'Done'].includes(
        issue.statusType ?? issue.status
      );
      out.push(
        proposal({
          kind: 'escaped-defect-untested',
          key: `${issue.id}:${path}`,
          title: `${issue.id} escaped in ${basename(path)}, which has no regression test`,
          confidence: closed ? 0.85 : 0.8,
          impact: 5,
          mechanical: true,
          area:
            labels.find(label => label.startsWith('area:')) ??
            'escaped-defects',
          evidence: [
            `${issue.id} (${labels.join(', ')}): ${issue.title}`,
            `${path} has no sibling test and no test imports it`,
          ],
          suggestion: `Add a regression test for ${path} that fails on the ${issue.id} behavior${closed ? ' (the fix shipped without one)' : ''}.`,
        })
      );
    }
  }
  return out;
}

/** Completed escaped defects must carry product and detector repair proof. */
export function collectEscapedDefectClosureGaps(issues) {
  const out = [];
  for (const issue of issues) {
    const closed = ['completed', 'Done'].includes(
      issue.statusType ?? issue.status
    );
    if (!closed) continue;
    const closure = evaluateEscapedDefectClosure(issue);
    if (!closure.applicable || closure.ok) continue;
    out.push(
      proposal({
        kind: 'escaped-defect-closure-unverified',
        key: issue.id,
        title: `${issue.id} closed without verified product and detector repair evidence`,
        confidence: 1,
        impact: 5,
        area: 'escaped-defects',
        originatingIssue: issue.id,
        evidence: [
          `${issue.id}: ${issue.title}`,
          ...closure.errors.map(error => `closure contract: ${error}`),
        ],
        suggestion: `Reopen ${issue.id}; attach the jovie.escaped-defect-closure/v1 receipt to that originating issue, then close it through the guarded transition after exact-build retest. Do not create a parallel repair record.`,
      })
    );
  }
  return out;
}

export function gitChurn(repoRoot, sinceDays, runGit = defaultGit) {
  const log = runGit(repoRoot, [
    'log',
    `--since=${sinceDays}.days`,
    '--no-merges',
    '--name-only',
    '--pretty=format:',
  ]);
  const churn = new Map();
  for (const line of log.split('\n')) {
    const path = line.trim();
    if (path) churn.set(path, (churn.get(path) ?? 0) + 1);
  }
  return churn;
}

function defaultGit(repoRoot, args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

function exportsComponent(source) {
  return /export\s+(?:default\s+)?(?:function|const)\s+[A-Z]\w*/.test(source);
}

/** Recently changed UI components with neither a story nor a test. */
export function collectComponentStateGaps(churn, repoRoot, testIndex) {
  const out = [];
  for (const [path, commits] of churn) {
    if (!/^(?:apps\/web\/components|packages\/ui\/atoms)\/.+\.tsx$/.test(path))
      continue;
    if (TEST_FILE.test(path) || STORY_FILE.test(path)) continue;
    const source = readText(repoRoot, path);
    if (!source || !exportsComponent(source)) continue;
    const storyPath = path.replace(/\.tsx$/, '.stories.tsx');
    if (existsSync(resolve(repoRoot, storyPath))) continue;
    if (hasTest(path, testIndex)) continue;
    const shared =
      path.startsWith('packages/ui/') || /\/(atoms|molecules)\//.test(path);
    out.push(
      proposal({
        kind: 'component-state-untested',
        key: path,
        title: `${basename(path)} changed ${commits}x with no state story or test`,
        confidence: shared || commits >= 3 ? 0.78 : commits >= 2 ? 0.6 : 0.45,
        impact: commits,
        mechanical: true,
        area: 'ui',
        evidence: [
          `${path}: ${commits} commit(s) in the window`,
          'no sibling .stories.tsx and no test imports it',
        ],
        suggestion: `Add a state story (default, loading, empty, error, long content) and a behavior test for ${basename(path)}.`,
      })
    );
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, PER_COLLECTOR_LIMIT);
}

/** Recently changed API routes and lib modules with no test. */
export function collectChangedCodeGaps(churn, repoRoot, testIndex) {
  const out = [];
  for (const [path, commits] of churn) {
    const isRoute = /^apps\/web\/app\/api\/.+\/route\.ts$/.test(path);
    const isLib = /^apps\/web\/lib\/.+\.tsx?$/.test(path);
    if (!isRoute && !isLib) continue;
    if (
      TEST_FILE.test(path) ||
      /\.d\.ts$|\/types?\.ts$|\/index\.ts$/.test(path)
    )
      continue;
    if (!existsSync(resolve(repoRoot, path))) continue;
    if (hasTest(path, testIndex)) continue;
    out.push(
      proposal({
        kind: 'changed-code-untested',
        key: path,
        title: `${isRoute ? 'API route' : 'Module'} ${path.replace(/^apps\/web\//, '')} changed ${commits}x with no test`,
        confidence: isRoute || commits >= 2 ? 0.8 : 0.45,
        impact: commits * (isRoute ? 2 : 1),
        mechanical: true,
        area: isRoute ? 'api' : 'lib',
        evidence: [
          `${path}: ${commits} commit(s) in the window`,
          'no sibling test and no test imports it',
        ],
        suggestion: `Add a behavior test for ${path} (${isRoute ? 'request contract, auth, and error paths' : 'core branches and failure paths'}).`,
      })
    );
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, PER_COLLECTOR_LIMIT);
}

/** Heatmap staleness and per-module coverage drops. */
export function collectCoverageGaps({
  heatmap,
  now = new Date(),
  summary = null,
  baseline = null,
}) {
  const out = [];
  const generated = heatmap.match(/Generated:\s*([0-9T:.\-Z]+)/)?.[1];
  if (generated) {
    const ageDays = Math.floor(
      (now.getTime() - Date.parse(generated)) / 86_400_000
    );
    if (ageDays > HEATMAP_STALE_DAYS) {
      out.push(
        proposal({
          kind: 'coverage-evidence-stale',
          key: 'docs/TEST_COVERAGE_HEATMAP.md',
          title: `Test coverage heatmap is ${ageDays} days stale`,
          confidence: 0.85,
          impact: 3,
          mechanical: true,
          area: 'testing',
          evidence: [
            `docs/TEST_COVERAGE_HEATMAP.md Generated: ${generated}`,
            `.claude/rules/testing.md names it the risk source of truth; stale after ${HEATMAP_STALE_DAYS} days`,
          ],
          suggestion:
            'Restore the nightly heatmap regeneration (pnpm run test:coverage:report) and fail the job when it cannot publish.',
        })
      );
    }
  }
  if (summary && baseline) {
    for (const [module, pct] of Object.entries(moduleCoverage(summary))) {
      const before = moduleCoverage(baseline)[module];
      if (before === undefined || before - pct < COVERAGE_DROP_PP) continue;
      out.push(
        proposal({
          kind: 'coverage-evidence-stale',
          key: `drop:${module}`,
          title: `Line coverage for ${module} fell ${(before - pct).toFixed(1)}pp`,
          confidence: 0.8,
          impact: Math.round(before - pct),
          mechanical: true,
          area: 'testing',
          evidence: [`${module}: ${before.toFixed(1)}% -> ${pct.toFixed(1)}%`],
          suggestion: `Restore tests for the code that dropped ${module} coverage.`,
        })
      );
    }
  }
  return out;
}

/** Istanbul json-summary -> line % per apps/web/<top>/<dir> module. */
export function moduleCoverage(summary) {
  const totals = new Map();
  for (const [file, data] of Object.entries(summary)) {
    if (file === 'total' || !data?.lines) continue;
    const match = posix(file).match(
      /(apps\/web\/[^/]+\/[^/]+|packages\/[^/]+\/[^/]+)/
    );
    if (!match) continue;
    const entry = totals.get(match[1]) ?? { covered: 0, total: 0 };
    entry.covered += data.lines.covered;
    entry.total += data.lines.total;
    totals.set(match[1], entry);
  }
  return Object.fromEntries(
    [...totals]
      .filter(([, entry]) => entry.total > 0)
      .map(([module, entry]) => [module, (100 * entry.covered) / entry.total])
  );
}

export function routeFromPage(relPath) {
  const segments = relPath
    .replace(/^apps\/web\/app\//, '')
    .replace(/(^|\/)page\.tsx$/, '')
    .split('/')
    .filter(
      segment =>
        segment && !/^\(.*\)$/.test(segment) && !segment.startsWith('@')
    );
  return `/${segments.join('/')}`;
}

/** Public routes with no performance budget in the route manifest. */
export function collectRouteBudgetGaps(pages, budgetedPaths) {
  const missing = pages
    .map(routeFromPage)
    .filter(route => !NON_PUBLIC_ROUTE.test(route))
    .filter(
      route =>
        !route.includes('/_') && !/(?:-render|\/preview)(?:\/|$)/.test(route)
    )
    .filter(route => !budgetedPaths.has(route));
  const groups = new Map();
  for (const route of [...new Set(missing)].sort()) {
    const group = route.startsWith('/[username]')
      ? 'public-profile'
      : `/${route.split('/')[1] ?? ''}`;
    const list = groups.get(group) ?? [];
    list.push(route);
    groups.set(group, list);
  }
  return [...groups]
    .map(([group, routes]) =>
      proposal({
        kind: 'route-budget-missing',
        key: group,
        title: `${routes.length} public route(s) under ${group} have no performance budget`,
        confidence: group === 'public-profile' || group === '/' ? 0.8 : 0.6,
        impact: routes.length * (group === 'public-profile' ? 3 : 1),
        mechanical: true,
        area: 'performance',
        evidence: routes
          .slice(0, 12)
          .map(
            route =>
              `${route} is not in apps/web/scripts/performance-route-manifest.ts`
          ),
        suggestion: `Add manifest entries for ${group} under the existing route-group budgets (docs/performance/route-budgets.json).`,
      })
    )
    .sort((a, b) => b.impact - a.impact)
    .slice(0, PER_COLLECTOR_LIMIT);
}

export function readBudgetedPaths(repoRoot = DEFAULT_ROOT) {
  const manifest = readText(
    repoRoot,
    'apps/web/scripts/performance-route-manifest.ts'
  );
  const paths = new Set(
    [...manifest.matchAll(/\bpath:\s*'([^']+)'/g)].map(m => m[1].split('?')[0])
  );
  const budgets = readText(repoRoot, 'docs/performance/route-budgets.json');
  for (const match of budgets.matchAll(/"(\/[^"]*)"/g)) paths.add(match[1]);
  return paths;
}

// ---------------------------------------------------------------------------
// scoring, dedupe, routing
// ---------------------------------------------------------------------------

export function route(proposals) {
  return proposals
    .filter(item => item.confidence >= MIN_CONFIDENCE)
    .map(item => ({
      ...item,
      lane: item.confidence >= HIGH_CONFIDENCE ? 'issue' : 'needs-tim',
    }));
}

/**
 * Drop proposals already filed (any state) and apply caps. `existing` holds
 * fingerprints found in Linear titles; `lowFiledToday` counts needs-tim
 * issues this finder created since UTC midnight.
 */
export function selectForFiling(
  proposals,
  {
    existing = new Set(),
    lowFiledToday = 0,
    maxHigh = MAX_HIGH_PER_RUN,
    maxLowPerDay = MAX_LOW_PER_DAY,
  } = {}
) {
  const rank = (a, b) =>
    b.confidence * b.impact - a.confidence * a.impact ||
    a.fingerprint.localeCompare(b.fingerprint);
  const fresh = route(proposals).filter(
    item => !existing.has(item.fingerprint)
  );
  const high = fresh.filter(item => item.lane === 'issue').sort(rank);
  const low = fresh.filter(item => item.lane === 'needs-tim').sort(rank);
  const lowBudget = Math.max(0, maxLowPerDay - lowFiledToday);
  return {
    file: [...high.slice(0, maxHigh), ...low.slice(0, lowBudget)],
    deferred: [...high.slice(maxHigh), ...low.slice(lowBudget)],
    suppressed: route(proposals).filter(item => existing.has(item.fingerprint)),
  };
}

export function issueTitle(item) {
  return `[${item.fingerprint}] Quality gap: ${item.title}`.slice(0, 250);
}

export function issueDescription(item, runUrl = 'local run') {
  return [
    `Automated quality-gap proposal (\`${item.kind}\`, confidence ${item.confidence}).`,
    item.lane === 'needs-tim'
      ? '\n**Low confidence: needs Tim.** Summer turns this into an Ovie inbox card. Accept by moving it to Todo; reject by canceling it. The finder never re-proposes a canceled fingerprint.'
      : '',
    '',
    item.originatingIssue
      ? `Originating defect: ${item.originatingIssue}`
      : null,
    item.originatingIssue ? '' : null,
    '## Evidence',
    ...item.evidence.map(line => `- ${line}`),
    '',
    '## Suggested guardrail',
    item.suggestion,
    '',
    '## Done when',
    '- The gap is closed by an executable test, invariant, or budget that fails on the old behavior.',
    '- Or this issue is canceled with the reason the gap is intentional.',
    '',
    `<!-- quality-gap-fingerprint: ${item.fingerprint} kind: ${item.kind} key: ${item.key} -->`,
    `Source: ${runUrl} (scripts/quality-gap-finder.mjs)`,
  ]
    .filter(line => line !== null)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Linear I/O (only with --file)
// ---------------------------------------------------------------------------

async function linearQuery(query, variables, apiKey, fetchImpl = fetch) {
  const response = await fetchImpl('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: apiKey },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = /** @type {any} */ (await response.json());
  if (!response.ok || body.errors?.length) {
    throw new Error(
      `Linear query failed (${response.status}): ${JSON.stringify(body.errors ?? body).slice(0, 300)}`
    );
  }
  return body.data;
}

export async function fetchExistingFingerprints(apiKey, now, fetchImpl) {
  const data = await linearQuery(
    `query($teamId: ID!) {
      issues(filter: { team: { id: { eq: $teamId } }, title: { contains: "[qg-" } }, first: 250, includeArchived: true) {
        nodes { title createdAt labels { nodes { name } } }
      }
    }`,
    { teamId: JOVIE_TEAM_ID },
    apiKey,
    fetchImpl
  );
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const existing = new Set();
  let lowFiledToday = 0;
  for (const node of data?.issues?.nodes ?? []) {
    const fingerprint = node.title.match(/\[(qg-[0-9a-f]{8})\]/)?.[1];
    if (fingerprint) existing.add(fingerprint);
    const isLow = node.labels?.nodes?.some(label => label.name === LABEL_LOW);
    if (isLow && Date.parse(node.createdAt) >= midnight) lowFiledToday += 1;
  }
  return { existing, lowFiledToday };
}

export async function fetchRecentDefects(apiKey, sinceDays, fetchImpl) {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const data = await linearQuery(
    `query($teamId: ID!, $since: DateTimeOrDuration!) {
      issues(filter: { team: { id: { eq: $teamId } }, updatedAt: { gte: $since } }, first: 250) {
        nodes { identifier title description state { name type } labels { nodes { name } } }
      }
    }`,
    { teamId: JOVIE_TEAM_ID, since },
    apiKey,
    fetchImpl
  );
  const issues = (data?.issues?.nodes ?? []).map(node => ({
    id: node.identifier,
    identifier: node.identifier,
    title: node.title,
    description: node.description ?? '',
    status: node.state?.name,
    statusType: node.state?.type,
    labels: node.labels?.nodes?.map(label => label.name) ?? [],
    comments: [],
  }));
  const closureCandidates = issues.filter(
    issue =>
      ['completed', 'Done'].includes(issue.statusType ?? issue.status) &&
      issue.labels.some(
        label => String(label).toLowerCase() === ESCAPED_DEFECT_LABEL
      )
  );
  if (closureCandidates.length === 0) return issues;
  const commentFields = closureCandidates
    .map(
      (issue, index) =>
        `i${index}: issue(id: "${issue.id}") { identifier comments(first: 50) { nodes { body } } }`
    )
    .join('\n');
  const commentData = await linearQuery(
    `query EscapedDefectClosureComments { ${commentFields} }`,
    {},
    apiKey,
    fetchImpl
  );
  const commentsByIssue = new Map(
    Object.values(commentData ?? {})
      .filter(Boolean)
      .map(issue => [
        issue.identifier,
        issue.comments?.nodes?.map(comment => comment.body) ?? [],
      ])
  );
  return issues.map(issue => ({
    ...issue,
    comments: commentsByIssue.get(issue.id) ?? [],
  }));
}

/** Linear state type per identifier, one aliased query. */
export async function fetchIssueStates(identifiers, apiKey, fetchImpl) {
  const ids = [...new Set(identifiers)].filter(id => /^[A-Z]+-\d+$/.test(id));
  if (ids.length === 0) return {};
  const fields = ids
    .map(
      (id, index) =>
        `i${index}: issue(id: "${id}") { identifier state { type } }`
    )
    .join('\n');
  const data = await linearQuery(`query { ${fields} }`, {}, apiKey, fetchImpl);
  return Object.fromEntries(
    Object.values(data ?? {})
      .filter(Boolean)
      .map(node => [node.identifier, node.state?.type])
  );
}

/** Resolve label ids by name, preferring Jovie team labels over workspace ones. */
export async function resolveLabelIds(names, apiKey, fetchImpl) {
  const data = await linearQuery(
    `query($names: [String!]) {
      issueLabels(first: 50, filter: { name: { in: $names } }) {
        nodes { id name team { id } }
      }
    }`,
    { names },
    apiKey,
    fetchImpl
  );
  const byName = new Map();
  for (const label of data?.issueLabels?.nodes ?? []) {
    const isTeam = label.team?.id === JOVIE_TEAM_ID;
    if (!byName.has(label.name) || isTeam) byName.set(label.name, label.id);
  }
  const missing = names.filter(name => !byName.has(name));
  if (missing.length) {
    throw new Error(`Linear label(s) missing: ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map(name => [name, byName.get(name)]));
}

// ---------------------------------------------------------------------------
// entrypoint
// ---------------------------------------------------------------------------

export function collectAll({
  repoRoot = DEFAULT_ROOT,
  sinceDays = 14,
  issues = [],
  now = new Date(),
  coverageSummary = null,
  coverageBaseline = null,
  actionStates = null,
  runGit = defaultGit,
} = {}) {
  const testIndex = buildTestIndex(repoRoot);
  const churn = gitChurn(repoRoot, sinceDays, runGit);
  const guardCorpus = [
    readText(repoRoot, 'canon/invariants.jsonl'),
    readText(repoRoot, '.github/ci-harness/ci-release-incidents.json'),
    ...listFiles(repoRoot, ['scripts'], name => SOURCE_EXT.has(extname(name)))
      .filter(rel => !rel.startsWith('scripts/quality-gap-finder'))
      .map(rel => readText(repoRoot, rel)),
  ].join('\n');
  const pages = listFiles(
    repoRoot,
    ['apps/web/app'],
    name => name === 'page.tsx'
  );
  return [
    ...collectInvariantGaps(
      readInvariants(repoRoot),
      readCiSources(repoRoot),
      readRunnerIncludePrefixes(repoRoot)
    ),
    ...collectPostmortemGaps(
      readPostmortems(repoRoot),
      guardCorpus,
      actionStates
    ),
    ...collectEscapedDefectClosureGaps(issues),
    ...collectEscapedDefectGaps(issues, repoRoot, testIndex),
    ...collectComponentStateGaps(churn, repoRoot, testIndex),
    ...collectChangedCodeGaps(churn, repoRoot, testIndex),
    ...collectCoverageGaps({
      heatmap: readText(repoRoot, 'docs/TEST_COVERAGE_HEATMAP.md'),
      now,
      summary: coverageSummary,
      baseline: coverageBaseline,
    }),
    ...collectRouteBudgetGaps(pages, readBudgetedPaths(repoRoot)),
  ];
}

function argValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function readJson(path) {
  return path ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

export function summarize(report) {
  const lines = [
    `## Quality gap finder`,
    '',
    `${report.proposals.length} proposal(s): ${report.counts.issue} high confidence, ${report.counts.needsTim} needs-tim. Filing ${report.selection.file.length}, deferred ${report.selection.deferred.length}, already filed ${report.selection.suppressed.length}.`,
    '',
    '| Lane | Conf | Kind | Proposal |',
    '| --- | --- | --- | --- |',
    ...report.selection.file.map(
      item =>
        `| ${item.lane} | ${item.confidence} | ${item.kind} | ${item.title.replaceAll('|', '/')} |`
    ),
  ];
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.includes('--file');
  const sinceDays = Number(argValue(args, '--since-days') ?? 14);
  const apiKey = process.env.LINEAR_API_KEY;
  const now = new Date();
  if (file && !apiKey) throw new Error('--file requires LINEAR_API_KEY');

  let issues = readJson(argValue(args, '--linear-issues')) ?? [];
  if (issues.length === 0 && apiKey) {
    issues = await fetchRecentDefects(apiKey, 30);
  }
  let actionStates = readJson(argValue(args, '--action-states'));
  if (!actionStates && apiKey) {
    actionStates = await fetchIssueStates(
      readPostmortems().flatMap(item => item.actions),
      apiKey
    );
  }
  const proposals = collectAll({
    sinceDays,
    issues,
    now,
    actionStates,
    coverageSummary: readJson(argValue(args, '--coverage-summary')),
    coverageBaseline: readJson(argValue(args, '--coverage-baseline')),
  });
  const dedupe = apiKey
    ? await fetchExistingFingerprints(apiKey, now)
    : { existing: new Set(), lowFiledToday: 0 };
  const selection = selectForFiling(proposals, dedupe);
  const routed = route(proposals);
  const report = {
    schema: REPORT_SCHEMA,
    generatedAt: now.toISOString(),
    mode: file ? 'file' : 'dry-run',
    counts: {
      total: routed.length,
      belowFloor: proposals.length - routed.length,
      issue: routed.filter(item => item.lane === 'issue').length,
      needsTim: routed.filter(item => item.lane === 'needs-tim').length,
      byKind: routed.reduce(
        (acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }),
        {}
      ),
    },
    proposals: routed,
    selection,
    filed: [],
  };

  if (file) {
    const runUrl = process.env.GITHUB_RUN_URL ?? 'local run';
    const labels = await resolveLabelIds(
      [LABEL_HIGH, LABEL_LOW, LABEL_AGENT_READY],
      apiKey
    );
    for (const item of selection.file) {
      const labelIds =
        item.lane === 'needs-tim'
          ? [labels[LABEL_LOW]]
          : [
              labels[LABEL_HIGH],
              ...(item.mechanical ? [labels[LABEL_AGENT_READY]] : []),
            ];
      const result = await upsertLinearIssueByTitleFingerprint({
        fingerprint: item.fingerprint,
        title: issueTitle(item),
        description: issueDescription(item, runUrl),
        priority: item.lane === 'needs-tim' ? 4 : 3,
        createStateName: 'Backlog',
        createLabelIds: labelIds,
        apiKey,
      });
      report.filed.push({
        fingerprint: item.fingerprint,
        lane: item.lane,
        ok: result.ok,
        action: result.action,
        identifier: result.identifier,
        reason: result.reason,
      });
      if (!result.ok) process.exitCode = 1;
    }
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  const out = argValue(args, '--out');
  if (out) writeFileSync(out, json);
  process.stdout.write(json);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summarize(report)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
