#!/usr/bin/env node
// Rolling mutation sweep over every tested apps/web module, on spare compute.
//
//   node scripts/mutation-sweep.mjs --state ~/.local/state/jovie-mutation/sweep-state.json \
//        --max-files 6 --max-minutes 90            # rolling sweep batch
//   node scripts/mutation-sweep.mjs --mode incremental  # only modules changed since scored
//   node scripts/mutation-sweep.mjs --list-only          # print the next batch, run nothing
//
// Per module it runs scripts/mutation-diff.mjs --scope all (same Stryker
// harness as the enforced high-risk lane), then records score, mutant counts,
// source blob and tested SHA in the state file, turns real survivors into
// bounded "strengthen test" work items (deduped Linear issue per module, only
// when remediation triggers are enabled) and suppresses recorded equivalent
// mutants. The state file is the per-module metric of record; each run also
// appends p50/p95-ready timing rows to <state>.runs.jsonl.

import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { priorityWeights, rankModules } from './lib/golden-path-assurance.mjs';
import {
  createTestSelector,
  readModuleSource,
  readReportMutants,
  readTestSources,
  selectHighRiskSources,
  WEB_ROOT,
} from './lib/mutation-diff.mjs';
import { buildWorkflowRunUrl } from './lib/mutation-floor-intake.mjs';
import { loadMutationScoreBaseline } from './lib/mutation-score-floor.mjs';
import {
  buildSurvivorIssue,
  emptyState,
  extractSurvivors,
  moduleKey,
  normalizeState,
  partitionEquivalents,
  pickBatch,
  proposeBaselineEntries,
  ratchetVerdict,
  recordRun,
  validateEquivalents,
} from './lib/mutation-sweep.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(repoRoot, WEB_ROOT);

const { values } = parseArgs({
  options: {
    state: { type: 'string' },
    mode: { type: 'string', default: 'sweep' },
    'max-files': { type: 'string', default: '4' },
    'max-minutes': { type: 'string', default: '60' },
    'file-timeout-minutes': { type: 'string', default: '25' },
    include: { type: 'string', default: 'lib/,app/api/' },
    'max-loc': { type: 'string', default: '700' },
    files: { type: 'string' },
    priority: { type: 'string' },
    'stage-counts': { type: 'string' },
    sha: { type: 'string' },
    summary: { type: 'string' },
    'github-output': { type: 'string' },
    'propose-baseline': { type: 'string' },
    'file-issues': { type: 'boolean', default: false },
    'list-only': { type: 'boolean', default: false },
    preflight: { type: 'boolean', default: false },
  },
});

/** Spare-compute gate: refuse to start when gem is busy. Exit 75 = skip. */
function preflight() {
  const minMemGb = Number(process.env.MUTATION_MIN_MEM_GB ?? 8);
  const maxLoad = Number(process.env.MUTATION_MAX_LOAD ?? 10);
  const minDiskGb = Number(process.env.MUTATION_MIN_DISK_GB ?? 15);
  const problems = [];
  if (existsSync('/proc/meminfo')) {
    const kb = Number(
      /MemAvailable:\s+(\d+)/u.exec(
        readFileSync('/proc/meminfo', 'utf8')
      )?.[1] ?? 0
    );
    if (kb / 1048576 < minMemGb)
      problems.push(
        `MemAvailable ${(kb / 1048576).toFixed(1)}GB < ${minMemGb}GB`
      );
  }
  if (existsSync('/proc/loadavg')) {
    const load = Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
    if (load > maxLoad) problems.push(`load ${load} > ${maxLoad}`);
  }
  const df = spawnSync('df', ['-Pk', repoRoot], { encoding: 'utf8' });
  const avail = Number(
    df.stdout?.split('\n')[1]?.split(/\s+/u)[3] ?? Number.NaN
  );
  if (Number.isFinite(avail) && avail / 1048576 < minDiskGb) {
    problems.push(
      `disk ${(avail / 1048576).toFixed(0)}GB free < ${minDiskGb}GB`
    );
  }
  return problems;
}

if (values.preflight) {
  const problems = preflight();
  if (problems.length > 0) {
    console.log(`Skipping mutation sweep, host busy: ${problems.join('; ')}`);
    process.exit(75);
  }
  console.log('Host has spare capacity.');
  process.exit(0);
}

const num = (/** @type {string} */ name) => {
  const value = Number(values[name]);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`--${name} must be positive`);
  return value;
};
if (!['sweep', 'incremental'].includes(values.mode))
  throw new Error('--mode must be sweep or incremental');
if (!values.state && !values['list-only'])
  throw new Error('--state <path> is required');

const git = (/** @type {string[]} */ args, input) =>
  spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', input });
const headSha = values.sha ?? git(['rev-parse', 'HEAD']).stdout.trim();

const baseline = loadMutationScoreBaseline(
  join(repoRoot, 'scripts/mutation-score-baseline.json')
);
const equivalentsPath = join(repoRoot, 'scripts/mutation-equivalents.json');
const equivalents = existsSync(equivalentsPath)
  ? JSON.parse(readFileSync(equivalentsPath, 'utf8'))
  : { schemaVersion: 1, entries: [] };
const equivalentErrors = validateEquivalents(equivalents);
if (equivalentErrors.length > 0)
  throw new Error(
    `Invalid mutation-equivalents.json: ${equivalentErrors.join('; ')}`
  );

const statePath = values.state ? resolve(values.state) : null;
let state = emptyState();
if (statePath && existsSync(statePath)) {
  try {
    state = normalizeState(JSON.parse(readFileSync(statePath, 'utf8')));
  } catch {
    state = emptyState();
  }
}

// --- candidates: every apps/web source under --include that has a related test
const staged = git(['ls-files', '-s', '-z', '--', WEB_ROOT])
  .stdout.split('\0')
  .filter(Boolean);
/** @type {Map<string, string>} repo path -> blob */
const blobs = new Map();
for (const row of staged) {
  const match = /^\d+ ([0-9a-f]{40}) \d\t(.+)$/u.exec(row);
  if (match) blobs.set(match[2], match[1]);
}
const tracked = [...blobs.keys()];
const readModule = readModuleSource(webRoot);
const includes = values.include.split(',').filter(Boolean);
const maxLoc = num('max-loc');
const explicit = values.files?.split(/[\s,]+/u).filter(Boolean);
// --priority <manifest>: Golden Path contract modules are always candidates
// and run first, ordered by stage volume x risk (--stage-counts overrides the
// manifest's volume snapshot with live funnel counts).
const priority = values.priority
  ? priorityWeights(
      rankModules(
        JSON.parse(readFileSync(resolve(values.priority), 'utf8')),
        values['stage-counts']
          ? JSON.parse(readFileSync(resolve(values['stage-counts']), 'utf8'))
          : {}
      )
    )
  : new Map();
const sources = selectHighRiskSources(explicit ?? tracked, readModule, {
  prefixes: null,
}).filter(
  file =>
    explicit ||
    priority.has(file) ||
    includes.some(prefix => file.startsWith(prefix))
);
const selectTests = createTestSelector(readTestSources(webRoot), readModule);
// Test selection costs ~1.3s per source (import-graph walk), so it runs lazily
// on the ranked batch only. Modules with a same-named test rank first.
const testStems = new Set(
  tracked
    .filter(path => /\.test\.tsx?$/u.test(path))
    .map(path =>
      path
        .split('/')
        .pop()
        .replace(/\.test\.tsx?$/u, '')
    )
);
/** @type {Map<string, string[]>} test stem -> blobs of its test files */
const testBlobsByStem = new Map();
for (const [path, blob] of blobs) {
  const m = /([^/]+)\.test\.tsx?$/u.exec(path);
  if (!m) continue;
  testBlobsByStem.set(m[1], [...(testBlobsByStem.get(m[1]) ?? []), blob]);
}
const GENERIC_STEMS = new Set([
  'route',
  'index',
  'page',
  'layout',
  'types',
  'constants',
]);
/** @type {{ file: string, blob: string, testCount: number }[]} */
const candidates = [];
for (const file of sources) {
  const text = readModule(file);
  if (typeof text !== 'string' || text.split('\n').length > maxLoc) continue;
  const stem = file
    .split('/')
    .pop()
    .replace(/\.tsx?$/u, '');
  candidates.push({
    file,
    blob: moduleKey(
      blobs.get(`${WEB_ROOT}/${file}`) ?? '',
      testBlobsByStem.get(stem) ?? []
    ),
    testCount: !GENERIC_STEMS.has(stem) && testStems.has(stem) ? 1 : 0,
  });
}
let pool = candidates;
if (values.mode === 'incremental') {
  pool = candidates.filter(
    c => state.modules[c.file] && state.modules[c.file].blob !== c.blob
  );
}
/** @type {string[]} */
let batch = [];
if (explicit) batch = candidates.map(c => c.file);
else {
  const maxFiles = num('max-files');
  for (const file of pickBatch(state, pool, {
    max: Number.POSITIVE_INFINITY,
    priority,
  })) {
    if (batch.length >= maxFiles) break;
    if (selectTests(file).length > 0) {
      batch.push(file);
      continue;
    }
    const c = candidates.find(x => x.file === file);
    state.modules[file] = {
      blob: c?.blob ?? '',
      sha: null,
      at: new Date().toISOString(),
      status: 'untested',
      score: null,
      valid: 0,
      killed: 0,
      survived: 0,
      durationMs: 0,
    };
  }
}

console.log(
  `${candidates.length} candidate modules; ${Object.keys(state.modules).length} scored; batch=${batch.length}`
);
for (const file of batch) console.log(`  next: ${file}`);
/** Modules still eligible after this batch; the workflow chains while > 0. */
const remainingAfter = () =>
  pickBatch(state, pool, { max: Number.POSITIVE_INFINITY }).length;
const writeOutputs = (/** @type {number} */ scoredNow) => {
  if (!values['github-output']) return;
  appendFileSync(
    values['github-output'],
    `remaining=${remainingAfter()}\nscored=${scoredNow}\n`
  );
};
const persist = () => {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(`${statePath}.tmp`, `${JSON.stringify(state, null, 1)}\n`);
  renameSync(`${statePath}.tmp`, statePath);
};
if (values['list-only'] || batch.length === 0) {
  if (!values['list-only'] && statePath) persist();
  writeOutputs(0);
  process.exit(0);
}

// --- run
const deadline = Date.now() + num('max-minutes') * 60_000;
const runUrl = buildWorkflowRunUrl(process.env);
const runsLog = `${statePath}.runs.jsonl`;
const reportDir = join(webRoot, 'reports/mutation/diff');
const tasksDir = join(dirname(statePath), 'survivor-tasks');
mkdirSync(tasksDir, { recursive: true });
/** @type {string[]} */ const summaryRows = [];
/** @type {{ file: string, reason: string }[]} */ const regressions = [];
let issuesFiled = 0;

for (const file of batch) {
  if (Date.now() > deadline) {
    console.log(`Time budget spent; ${file} left for the next run.`);
    break;
  }
  const started = Date.now();
  const candidate = candidates.find(c => c.file === file);
  const blob = candidate?.blob ?? '';
  const reportFile = join(reportDir, `${file.replace(/[^\w.-]+/gu, '_')}.json`);
  rmSync(reportFile, { force: true });
  console.log(`\n=== sweep ${file}`);
  const run = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'scripts/mutation-diff.mjs'),
      '--scope',
      'all',
      '--files',
      `${WEB_ROOT}/${file}`,
      '--max-files',
      '1',
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      timeout: num('file-timeout-minutes') * 60_000,
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
        CI: 'true',
        STRYKER_CONCURRENCY: process.env.STRYKER_CONCURRENCY ?? '4',
      },
    }
  );
  const durationMs = Date.now() - started;
  const at = new Date().toISOString();
  const previous = state.modules[file];
  const mutants = existsSync(reportFile)
    ? readReportMutants(reportFile, file)
    : null;
  let entry;
  if (!mutants || mutants.length === 0) {
    entry = recordRun(state, file, {
      blob,
      sha: headSha,
      at,
      durationMs,
      error: run.error?.message ?? `harness exit ${run.status ?? run.signal}`,
    });
  } else {
    const survivors = extractSurvivors(
      file,
      readFileSync(join(webRoot, file), 'utf8'),
      // Stryker reports carry full spans; the diff-lib Mutant typedef is narrower.
      /** @type {Parameters<typeof extractSurvivors>[2]} */ (
        /** @type {unknown} */ (mutants)
      )
    );
    const { real, equivalent } = partitionEquivalents(survivors, equivalents);
    entry = recordRun(state, file, {
      blob,
      sha: headSha,
      at,
      durationMs,
      mutants,
      equivalent: equivalent.length,
    });
    // Survivors that the registry calls equivalent do not count against the score.
    if (equivalent.length > 0 && entry.valid > 0) {
      const detected = entry.killed;
      const valid = entry.valid - equivalent.length;
      entry.valid = valid;
      entry.survived = Math.max(0, entry.survived - equivalent.length);
      entry.score =
        valid > 0 ? Math.round((detected / valid) * 1000) / 10 : null;
    }
    const tests = selectTests(file).slice(0, 15);
    writeFileSync(
      join(tasksDir, `${file.replace(/[^\w.-]+/gu, '_')}.json`),
      `${JSON.stringify({ file, sha: headSha, score: entry.score, valid: entry.valid, tests, survivors: real }, null, 1)}\n`
    );
    if (values['file-issues'] && real.length > 0) {
      const {
        remediationTriggersEnabled,
        upsertLinearIssueByTitleFingerprint,
        logRemediationDryRun,
      } = await import('./lib/linear-issue-intake.mjs');
      const issue = buildSurvivorIssue(file, real, {
        score: entry.score,
        valid: entry.valid,
        tests,
        sha: headSha,
        runUrl,
      });
      if (remediationTriggersEnabled(process.env)) {
        const res = await upsertLinearIssueByTitleFingerprint({
          fingerprint: issue.fingerprint,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          reopenTerminal: false,
          labelKey: issue.labelKey,
        });
        console.log(
          `Linear survivors issue (${file}): ${res.action ?? 'failed'} ${res.url ?? res.reason ?? ''}`
        );
        issuesFiled += 1;
      } else
        logRemediationDryRun({
          action: 'upsert',
          key: 'mutation-survivors',
          fingerprint: issue.fingerprint,
        });
    }
  }
  const verdict = ratchetVerdict(file, entry, previous, baseline);
  if (!verdict.ok) regressions.push({ file, reason: verdict.reason });
  appendFileSync(
    runsLog,
    `${JSON.stringify({ at, file, sha: headSha, mode: values.mode, durationMs, status: entry.status, score: entry.score, valid: entry.valid, survived: entry.survived, ratchet: verdict.ok ? 'ok' : verdict.reason, runUrl })}\n`
  );
  summaryRows.push(
    `| \`${file}\` | ${entry.status === 'scored' ? `${entry.score}%` : 'error'} | ${entry.valid} | ${entry.survived} | ${Math.round(durationMs / 1000)}s | ${verdict.ok ? verdict.reason : `REGRESSED: ${verdict.reason}`} |`
  );
  // Atomic persist after every module so a killed run loses at most one.
  persist();
  rmSync(reportFile, { force: true });
  rmSync(`${reportFile}.tests.json`, { force: true });
  rmSync(`${reportFile}.coverage`, { recursive: true, force: true });
  rmSync(join(webRoot, '.stryker-tmp'), { recursive: true, force: true });
}

writeOutputs(batch.length);
const scored = Object.values(state.modules).filter(m => m.status === 'scored');
const summary = [
  '## Mutation sweep',
  '',
  `Mode \`${values.mode}\` @ ${headSha.slice(0, 10)}. ${scored.length} module(s) scored in total; ${candidates.length} eligible.`,
  '',
  '| Module | Score | Valid | Survived | Time | Ratchet |',
  '| --- | ---: | ---: | ---: | ---: | --- |',
  ...summaryRows,
  '',
  issuesFiled ? `${issuesFiled} survivor work item(s) filed.\n` : '',
].join('\n');
console.log(`\n${summary}`);
if (values.summary) appendFileSync(values.summary, summary);
if (values['propose-baseline']) {
  const proposal = proposeBaselineEntries(state, baseline, {
    runId: Number(process.env.GITHUB_RUN_ID ?? 0) || 1,
    sha: headSha,
  });
  writeFileSync(
    values['propose-baseline'],
    `${JSON.stringify(proposal, null, 1)}\n`
  );
}
if (regressions.length > 0) {
  for (const r of regressions)
    console.error(`::error::mutation ratchet: ${r.file}: ${r.reason}`);
  process.exitCode = 1;
}
