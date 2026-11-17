#!/usr/bin/env node

// Rolling spare-capacity sweep; existing web/UI state identities stay stable.
//   --mode incremental selects changed inputs; --include packages/ui/ selects UI.
// Survivor task JSON feeds the separate approval-required draft preparation step.

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
import { spawnSync } from './lib/child-process.mjs';
import {
  createTestSelector,
  readModuleSource,
  readReportMutants,
  readTestSources,
  selectHighRiskSources,
} from './lib/mutation-diff.mjs';
import {
  proposeEvidenceFloors,
  strongerHighWater,
} from './lib/mutation-evidence.mjs';
import { buildWorkflowRunUrl } from './lib/mutation-floor-intake.mjs';
import {
  configurationPaths,
  inputDigest,
  mutationInputReceipt,
  mutationInputsUnchanged,
  repositoryReader,
  sweepEvidenceCandidates,
  untestedMutationEntry,
} from './lib/mutation-inputs.mjs';
import {
  mutationRunSucceeded,
  runMutationHarness,
} from './lib/mutation-lifecycle.mjs';
import { loadMutationScoreBaseline } from './lib/mutation-score-floor.mjs';
import {
  emptyState,
  moduleKey,
  normalizeState,
  pickBatch,
  selectPool,
  validateEquivalents,
} from './lib/mutation-sweep.mjs';
import {
  recordEvidenceAttempt,
  unresolvedMutationRun,
} from './lib/mutation-sweep-attempt.mjs';
import {
  harnessArgs,
  reportName,
  resolveSweepRoot,
  rootRelative,
  stateKey,
} from './lib/mutation-sweep-root.mjs';
import { preflight as checkCapacity } from './mutation-sweep-preflight.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    state: { type: 'string' },
    mode: { type: 'string', default: 'sweep' },
    'max-files': { type: 'string', default: '4' },
    'max-minutes': { type: 'string', default: '60' },
    'file-timeout-minutes': { type: 'string', default: '25' },
    include: { type: 'string' }, // default lib/,app/api/ (apps/web)
    'max-loc': { type: 'string', default: '700' },
    files: { type: 'string' },
    sha: { type: 'string' },
    summary: { type: 'string' },
    'github-output': { type: 'string' },
    'propose-baseline': { type: 'string' },
    'file-issues': { type: 'boolean', default: false },
    'touch-file': { type: 'string' },
    'list-only': { type: 'boolean', default: false },
    preflight: { type: 'boolean', default: false },
    shard: { type: 'string' },
  },
});

/** Spare-compute gate: refuse to start when gem is busy. Exit 75 = skip. */
const preflight = () => checkCapacity(repoRoot);

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
if (values['file-issues'])
  throw new Error(
    'Survivor text requires approval; prepare drafts with mutation-sweep-file-issues.mjs --drafts <path> --state <path> --tasks <dir>'
  );
if (!values.state && !values['list-only'])
  throw new Error('--state <path> is required');

const git = (/** @type {string[]} */ args, input) =>
  spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', input });
const head = git(['rev-parse', 'HEAD']);
if (head.status !== 0 && !values['list-only'])
  throw new Error('Cannot resolve tested commit');
const headSha = head.stdout.trim();
if (values.sha && values.sha !== headSha)
  throw new Error('--sha must match checked-out HEAD');
const worktree = git(['status', '--porcelain', '--untracked-files=normal']);
const testedSha =
  worktree.status === 0 && !worktree.stdout.trim() ? headSha : null;

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

const target = resolveSweepRoot(values);
const rootDir = join(repoRoot, target.root);
const rel = (/** @type {string} */ key) => rootRelative(target, key);

const statePath = values.state ? resolve(values.state) : null;
let state = emptyState();
if (statePath && existsSync(statePath)) {
  try {
    state = normalizeState(JSON.parse(readFileSync(statePath, 'utf8')));
  } catch {
    state = emptyState();
  }
}

// Independent anchors survive a later baseline fold replacing a module attempt.
const anchors = /** @type {Record<string, any>} */ (state).highWater ?? {};
/** @type {any} */ (state).highWater = anchors;

// --- candidates: every source of the target root under --include with a related test
const staged = git(['ls-files', '-s', '-z', '--', target.root])
  .stdout.split('\0')
  .filter(Boolean);
/** @type {Map<string, string>} repo path -> blob */
const blobs = new Map();
for (const row of staged) {
  const match = /^\d+ ([0-9a-f]{40}) \d\t(.+)$/u.exec(row);
  if (match) blobs.set(match[2], match[1]);
}
const tracked = [...blobs.keys()];
const inventory = git(['ls-files', '-z']);
if (inventory.status !== 0 && !values['list-only'])
  throw new Error('Mutation input inventory unavailable');
const inputPaths = inventory.stdout.split('\0').filter(Boolean);
const readInput = repositoryReader(repoRoot);
const readModule = readModuleSource(rootDir);
const includes = target.includes;
const maxLoc = num('max-loc');
const explicit = values.files?.split(/[\s,]+/u).filter(Boolean);
const sources = selectHighRiskSources(explicit ?? tracked, readModule, {
  prefixes: null,
  root: target.root,
}).filter(file => explicit || includes.some(prefix => file.startsWith(prefix)));
const selectRootTests = createTestSelector(
  readTestSources(rootDir),
  readModule
);
const selectTests = (/** @type {string} */ key) => selectRootTests(rel(key));
// Select tests lazily for the ranked batch; bind the shared graph once.
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
/** @type {{ file: string, blob: string, testCount: number, touch?: number }[]} */
const candidates = [];
/** @type {Record<string, number>} */
const touchByFile = values['touch-file']
  ? Object.fromEntries(
      JSON.parse(readFileSync(values['touch-file'], 'utf8')).map(r => [
        r.file,
        r.touch,
      ])
    )
  : {};
for (const source of sources) {
  const file = stateKey(target, source);
  const text = readModule(source);
  if (typeof text !== 'string' || text.split('\n').length > maxLoc) continue;
  const stem = file
    .split('/')
    .pop()
    .replace(/\.tsx?$/u, '');
  candidates.push({
    file,
    blob: moduleKey(
      blobs.get(`${target.root}/${source}`) ?? '',
      testBlobsByStem.get(stem) ?? []
    ),
    touch: touchByFile[file] ?? 0,
    testCount: !GENERIC_STEMS.has(stem) && testStems.has(stem) ? 1 : 0,
  });
}
const configDigest = inputDigest(
  configurationPaths(inputPaths, target.root),
  readInput
);
const selectionDigest = inputDigest(['selection'], () =>
  JSON.stringify(selectRootTests.inventory())
);
const metadata = /** @type {any} */ (state);
const sequences = (metadata.sweepSequences ??= {});
const runId = Number(sequences[target.root] ?? 0) + 1;
const { selectionState, eligible } = sweepEvidenceCandidates(
  candidates,
  state,
  configDigest,
  selectionDigest,
  readInput,
  runId
);
const pool = selectPool(eligible, selectionState, values);
/** @type {string[]} */
let batch = [];
if (explicit) batch = eligible.map(c => c.file);
else {
  const maxFiles = num('max-files');
  for (const file of pickBatch(selectionState, pool, {
    max: Number.POSITIVE_INFINITY,
  })) {
    if (batch.length >= maxFiles) break;
    if (selectTests(file).length > 0) {
      batch.push(file);
      continue;
    }
    const c = candidates.find(x => x.file === file);
    state.modules[file] = untestedMutationEntry(
      c?.blob ?? '',
      `${target.root}/${rel(file)}`,
      configDigest,
      selectionDigest,
      readInput
    );
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
if (!values['list-only']) sequences[target.root] = runId;
if (values['list-only'] || batch.length === 0) {
  if (!values['list-only'] && statePath) persist();
  writeOutputs(0);
  process.exit(0);
}

// --- run
const deadline = Date.now() + num('max-minutes') * 60_000;
const runUrl = buildWorkflowRunUrl(process.env);
const runsLog = `${statePath}.runs.jsonl`;
const reportDir = join(rootDir, 'reports/mutation/diff');
const tasksDir = join(dirname(statePath), 'survivor-tasks');
mkdirSync(tasksDir, { recursive: true });
/** @type {string[]} */ const summaryRows = [];
/** @type {{ file: string, reason: string }[]} */ const regressions = [];
let scoredNow = 0;

for (const file of batch) {
  // Off-peak only: re-check the 5-minute load before every module, not just at start.
  const busy = preflight();
  if (busy.length > 0) {
    console.log(`Host busy before ${file}, stopping: ${busy.join('; ')}`);
    break;
  }
  if (Date.now() > deadline) {
    console.log(`Time budget spent; ${file} left for the next run.`);
    break;
  }
  const started = Date.now();
  const tests = selectTests(file).slice(0, 15);
  const receipt = mutationInputReceipt({
    root: target.root,
    source: rel(file),
    tests,
    selector: selectRootTests,
    tracked: inputPaths,
    read: readInput,
  });
  const originalSource = readInput(`${target.root}/${rel(file)}`);
  const taskFile = join(tasksDir, `${file.replace(/[^\w.-]+/gu, '_')}.json`);
  rmSync(taskFile, { force: true });
  const candidate = candidates.find(c => c.file === file);
  const blob = candidate?.blob ?? '';
  const reportFile = join(reportDir, reportName(rel(file)));
  rmSync(reportFile, { force: true });
  console.log(`\n=== sweep ${file}`);
  /** @type {any} */
  const run = receipt.unresolvedInputs.length
    ? unresolvedMutationRun(receipt.unresolvedInputs)
    : await runMutationHarness(
        process.execPath,
        [join(repoRoot, target.harness), ...harnessArgs(target, rel(file))],
        {
          cwd: repoRoot,
          rootDir,
          sourcePath: join(rootDir, rel(file)),
          timeoutMs: num('file-timeout-minutes') * 60_000,
          env: {
            ...process.env,
            CI: 'true',
            STRYKER_CONCURRENCY: process.env.STRYKER_CONCURRENCY ?? '1',
          },
        }
      );
  const durationMs = Date.now() - started;
  const at = new Date().toISOString();
  const previous = {
    ...state.modules[file],
    highWater: strongerHighWater(
      anchors[file],
      /** @type {any} */ (state.modules[file])?.highWater
    ),
  };
  let reportMutants = null;
  let reportError;
  try {
    reportMutants = readReportMutants(reportFile, rel(file), originalSource);
  } catch (error) {
    reportError = error.message;
  }
  const mutants =
    mutationRunSucceeded(run) && !reportError ? reportMutants : null;
  const unchanged =
    receipt.configDigest === configDigest &&
    receipt.selectionDigest === selectionDigest &&
    mutationInputsUnchanged(receipt, {
      root: target.root,
      rootDir,
      selector: selectRootTests,
      read: readInput,
    });
  const partialMutants = mutants ? null : reportMutants;
  const { entry, verdict, task } = recordEvidenceAttempt({
    state,
    file,
    blob,
    sha: testedSha,
    at,
    durationMs,
    mutants,
    partialMutants,
    source: originalSource,
    tests,
    baseline,
    equivalents,
    configDigest,
    runId,
    timedOut: run.timedOut,
    unchanged,
    receipt,
    previous,
    error:
      reportError ??
      run.error?.message ??
      'Missing or mismatched source report',
  });
  if (entry.highWater) anchors[file] = entry.highWater;
  if (entry.status !== 'scored') entry.retryAfterRun ??= runId + 3;
  if (task) {
    writeFileSync(taskFile, `${JSON.stringify(task, null, 1)}\n`);
  }
  if (entry.status === 'scored' && entry.score !== null) scoredNow++;
  // Cleanly stopped infrastructure attempts remain unknown, with bounded retry parking.
  const stoppedCleanly =
    (run.timedOut || run.interrupted || run.unsupported) &&
    run.cleanupProved === true;
  if ((!mutationRunSucceeded(run) || entry.error) && !stoppedCleanly)
    process.exitCode = 1;
  if (verdict.ok === false) regressions.push({ file, reason: verdict.reason });
  appendFileSync(
    runsLog,
    `${JSON.stringify({ at, file, sha: testedSha, mode: values.mode, durationMs, status: entry.status, score: entry.score, valid: entry.valid, survived: entry.survived, ratchet: verdict.status, reason: verdict.reason, runUrl })}\n`
  );
  const scoreCell =
    entry.status === 'scored'
      ? `${entry.score}%`
      : run.timedOut
        ? 'timeout (unscored)'
        : run.interrupted
          ? 'interrupted (unscored)'
          : 'error';
  summaryRows.push(
    `| \`${file}\` | ${scoreCell} | ${entry.valid} | ${entry.survived} | ${Math.round(durationMs / 1000)}s | ${verdict.status}: ${verdict.reason} |`
  );
  // Atomic persist after every module so a killed run loses at most one.
  persist();
  if (!run.cleanupProved) {
    console.error(
      `${file}: cleanup unproved; recovery files retained at ${run.tempDir}`
    );
    break;
  }
  rmSync(reportFile, { force: true });
  rmSync(`${reportFile}.tests.json`, { force: true });
  rmSync(`${reportFile}.coverage`, { recursive: true, force: true });
  if (run.timedOut || run.interrupted) {
    console.log(
      `${file} ${run.interrupted ? 'interrupted' : 'timed out'}; owned mutation run stopped. Recorded unknown and parked for three sweep invocations.`
    );
    break;
  }
}

writeOutputs(scoredNow);
const scored = Object.values(state.modules).filter(m => m.status === 'scored');
const summary = [
  `## Mutation sweep (${target.root})`,
  '',
  `Mode \`${values.mode}\` @ ${headSha.slice(0, 10)}. ${scored.length} module(s) scored in total; ${candidates.length} eligible.`,
  '',
  '| Module | Score | Valid | Survived | Time | Ratchet |',
  '| --- | ---: | ---: | ---: | ---: | --- |',
  ...summaryRows,
  '',
].join('\n');
console.log(`\n${summary}`);
if (values.summary) appendFileSync(values.summary, summary);
if (values['propose-baseline']) {
  const proposal = proposeEvidenceFloors(state, baseline, {
    runId,
    configDigest,
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
