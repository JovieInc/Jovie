import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  FAILED_MARKER,
  formatReport,
  loadGuards,
  runGuards,
  runGuardsParallel,
} from './queue-drift-precheck.mjs';
import { resolveCandidate, verdict } from './queue-drift-resolve.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const read = path => readFileSync(path, 'utf8');
const enroll = load(read('.github/workflows/merge-queue-green-enroll.yml'));
const ci = load(read('.github/workflows/ci.yml'));

const fakeSpawn = table => (command, args) => {
  const entry = table[args.at(-1)] ?? { status: 0 };
  return { stdout: '', stderr: '', ...entry };
};
const guard = (id, extra = {}) => ({ id, command: ['node', id], ...extra });

test('manifest lists the drift-prone guards and every entry is well formed', () => {
  const guards = loadGuards('scripts/lib/queue-drift-guards.json');
  const ids = guards.map(entry => entry.id);
  assert.ok(ids.includes('doc-freshness'));
  assert.ok(ids.includes('data-architecture-guard'));
  for (const entry of guards) {
    assert.match(
      entry.command[1],
      /^(scripts|apps\/web\/scripts)\/[\w./-]+\.mjs$/
    );
    assert.deepEqual(entry.requires, [entry.command[1]]);
  }
});

test('a clean tree passes, a failing guard is reported with its remediation', () => {
  const root = mkdtempSync(join(tmpdir(), 'drift-'));
  const results = runGuards({
    guards: [guard('ok'), guard('bad', { remediation: 'fix it' })],
    root,
    spawn: fakeSpawn({ bad: { status: 1, stderr: 'ratchet grew 3 -> 4' } }),
  });
  assert.deepEqual(
    results.map(r => r.status),
    ['pass', 'fail']
  );
  const report = formatReport(results);
  assert.ok(report.startsWith(FAILED_MARKER));
  assert.match(report, /- bad: fix it/);
  assert.match(report, /ratchet grew 3 -> 4/);
  assert.equal(formatReport([results[0]]), '');
});

test('undecidable guards fail open: absent, timed out, or cannot load', () => {
  const root = mkdtempSync(join(tmpdir(), 'drift-'));
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/present.mjs'), '');
  const results = runGuards({
    guards: [
      guard('absent', { requires: ['scripts/missing.mjs'] }),
      guard('timeout', { requires: ['scripts/present.mjs'] }),
      guard('deps', { requires: ['scripts/present.mjs'] }),
    ],
    root,
    spawn: fakeSpawn({
      timeout: { status: null, signal: 'SIGTERM' },
      deps: { status: 1, stderr: 'Error [ERR_MODULE_NOT_FOUND]: nope' },
    }),
  });
  assert.deepEqual(
    results.map(r => r.status),
    ['skipped', 'error', 'error']
  );
  assert.equal(formatReport(results), '');
});

test('the real guards pass on this tree (no hand-maintained count to drift)', async () => {
  const results = await runGuardsParallel({
    guards: loadGuards('scripts/lib/queue-drift-guards.json'),
  });
  assert.deepEqual(
    results.filter(r => r.status === 'fail'),
    []
  );
});

const prBody = (extra = {}) => ({
  state: 'open',
  draft: false,
  mergeable: true,
  base: { ref: 'main' },
  head: { sha: 'h'.repeat(40), repo: { full_name: 'o/r' } },
  merge_commit_sha: 'm'.repeat(40),
  ...extra,
});
/** @param {any} [opts] */
const fakeGh =
  ({ pr = prBody(), mainSha = 'a'.repeat(40), parents } = {}) =>
  async args => {
    const path = args[1];
    const body = path.endsWith('/pulls/7')
      ? pr
      : path.endsWith('/git/ref/heads/main')
        ? { object: { sha: mainSha } }
        : {
            parents: (parents ?? [mainSha, 'h'.repeat(40)]).map(sha => ({
              sha,
            })),
          };
    return { code: 0, stdout: JSON.stringify(body), stderr: '' };
  };
const resolveWith = (gh, number = 7) =>
  resolveCandidate({ number, repository: 'o/r', gh, sleep: async () => {} });

test('resolve checks only a fresh test merge built on current main and this head', async () => {
  const ok = await resolveWith(fakeGh());
  assert.equal(ok.run, true);
  assert.equal(ok.mergeSha, 'm'.repeat(40));
  assert.equal(
    (await resolveWith(fakeGh({ parents: ['b'.repeat(40), 'h'.repeat(40)] })))
      .run,
    false
  );
  assert.equal(
    (await resolveWith(fakeGh({ parents: ['a'.repeat(40), 'x'.repeat(40)] })))
      .run,
    false
  );
  assert.equal(
    (await resolveWith(fakeGh({ pr: prBody({ draft: true }) }))).run,
    false
  );
  assert.equal(
    (await resolveWith(fakeGh({ pr: prBody({ mergeable: false }) }))).run,
    false
  );
  assert.equal(
    (await resolveWith(fakeGh({ pr: prBody({ mergeable: null }) }))).run,
    false
  );
  assert.equal(
    (
      await resolveWith(
        fakeGh({
          pr: prBody({
            head: { sha: 'h'.repeat(40), repo: { full_name: 'fork/r' } },
          }),
        })
      )
    ).run,
    false
  );
  assert.equal((await resolveWith(fakeGh(), 0)).run, false);
});

test('verdict: only a script-written report is drift; crashes give no verdict', () => {
  const report = `${FAILED_MARKER}\n- doc-freshness: x @owner \`\`\`y`;
  const failed = verdict({ outcome: 'failure', reportText: report });
  assert.equal(failed.status, 'failed');
  assert.ok(!failed.report.includes('```'));
  assert.ok(!/@owner/.test(failed.report));
  assert.equal(verdict({ outcome: 'failure', reportText: '' }).status, 'none');
  assert.equal(
    verdict({ outcome: 'failure', reportText: 'boom' }).status,
    'none'
  );
  assert.equal(
    verdict({ outcome: 'skipped', reportText: report }).status,
    'none'
  );
  assert.equal(
    verdict({ outcome: 'success', reportText: '' }).status,
    'passed'
  );
});

test('enroll waits for the precheck and never executes PR code itself', () => {
  assert.ok(enroll.jobs.enroll.needs.includes('drift-precheck'));
  assert.match(enroll.jobs.enroll.if, /always\(\)/);
  const job = enroll.jobs['drift-precheck'];
  assert.deepEqual(job.permissions, {
    contents: 'read',
    'pull-requests': 'read',
  });
  // PR-authored code: one step, in the `merged` checkout, with no secret in env.
  const guards = job.steps.find(step => step.id === 'guards');
  assert.match(
    guards.run,
    /node merged\/scripts\/queue-drift-precheck\.mjs --root merged/
  );
  assert.match(guards.run, /\|\| echo "failed=true" >> "\$GITHUB_OUTPUT"/);
  assert.equal(guards.env, undefined);
  const mergedCheckout = job.steps.find(step => step.with?.path === 'merged');
  assert.equal(mergedCheckout.with['persist-credentials'], false);
  assert.ok(!JSON.stringify(job).includes('app-token'));
  const enrollEnv = enroll.jobs.enroll.steps.find(
    step => step.with?.script
  ).env;
  for (const name of [
    'DRIFT_FAILED_PR',
    'DRIFT_FAILED_HEAD',
    'DRIFT_PASSED_PR',
    'DRIFT_REPORT',
  ]) {
    assert.ok(name in enrollEnv, name);
  }
  const script = enroll.jobs.enroll.steps.find(step => step.with?.script).with
    .script;
  const driftAt = script.indexOf('DRIFT_FAILED_PR');
  assert.ok(
    driftAt > 0 && script.indexOf('enqueuePullRequest') > driftAt,
    'drift hold precedes enqueue'
  );
});

test('Storybook Surface Matrix runs on source PRs and PR Ready requires it', () => {
  const surfaces = ci.jobs['ci-storybook-surfaces'];
  assert.match(surfaces.if, /github\.event_name == 'pull_request'/);
  assert.match(surfaces.if, /run_storybook_surfaces == 'true'/);
  assert.ok(ci.jobs['ci-path-changes'].outputs.run_storybook_surfaces);
  assert.ok(ci.jobs['ci-pr-ready'].needs.includes('ci-storybook-surfaces'));
  const gate = ci.jobs['ci-pr-ready'].steps
    .map(step => step.run ?? '')
    .join('\n');
  assert.match(
    gate,
    /RUN_STORYBOOK_SURFACES.*== "true".*STORYBOOK_SURFACES_RESULT.*!= "success"/
  );
});

test('the Storybook path filter matches stories, their specs, and the components they cover', () => {
  const detect = ci.jobs['ci-path-changes'].steps.find(
    step => step.id === 'storybook-surfaces'
  ).run;
  const source = /pattern='([^']+)'/.exec(detect)[1];
  const pattern = new RegExp(source);
  for (const hit of [
    'apps/web/components/features/dashboard/atoms/Foo.stories.tsx',
    'apps/web/components/features/dashboard/atoms/Foo.tsx',
    'apps/web/tests/e2e/storybook-input.spec.ts',
    'apps/web/.storybook/preview.tsx',
    'packages/ui/atoms/button.tsx',
  ])
    assert.ok(pattern.test(hit), hit);
  for (const miss of [
    'apps/web/app/api/foo/route.ts',
    'docs/readme.md',
    'apps/web/lib/db/index.ts',
  ])
    assert.ok(!pattern.test(miss), miss);
});

test('CLAUDE.md carries no hand-maintained scoped-rules count', () => {
  assert.ok(!read('CLAUDE.md').includes('doc-freshness:scoped-rules-count'));
  const registry = JSON.parse(read('docs/doc-freshness-registry.json'));
  assert.ok(
    !registry.freshnessMarkers.some(marker =>
      marker.files.includes('CLAUDE.md')
    )
  );
});

// Baseline-class guard = a standalone script that compares a committed
// baseline, ratchet, census, allowlist or digest with the tree. Those are the
// guards that pass on main and fail once main moves under a queued PR, so each
// must run in the precheck or say why it cannot.
const BASELINE_CLASS =
  /(baseline|ratchet|census|allowlist)[A-Za-z0-9_.-]*\.json|BASELINE_PATH|--(write|update)-baseline|sourceDigest/i;
const SCAN_ROOTS = ['scripts', 'apps/web/scripts', '.github/scripts'];

function scriptFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'fixtures', '__tests__'].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) scriptFiles(path, out);
    else if (/\.(mjs|js)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

function baselineClassScripts() {
  return SCAN_ROOTS.flatMap(root => scriptFiles(root))
    .filter(path => !path.startsWith('scripts/lib/'))
    .filter(path => BASELINE_CLASS.test(readFileSync(path, 'utf8')))
    .sort();
}

test('every baseline-class guard is in queue-drift-guards.json or exempt with a reason', () => {
  const manifest = JSON.parse(read('scripts/lib/queue-drift-guards.json'));
  const listed = new Set(
    manifest.guards.flatMap(entry => entry.requires ?? [])
  );
  const exempt = new Map();
  for (const group of manifest.exempt ?? []) {
    assert.ok(group.reason?.trim(), 'every exempt group needs a reason');
    for (const path of group.paths) exempt.set(path, group.reason);
  }
  const missing = baselineClassScripts().filter(
    path => !listed.has(path) && !exempt.has(path)
  );
  assert.deepEqual(
    missing,
    [],
    `Baseline-class scripts missing from scripts/lib/queue-drift-guards.json (add a guard, or an exempt entry with a reason):\n${missing.join('\n')}`
  );
  for (const path of listed) {
    assert.ok(!exempt.has(path), `${path} is both a guard and exempt`);
  }
  for (const path of [...listed, ...exempt.keys()]) {
    // A guard may be listed before it lands (see the manifest comment).
    if (listed.has(path) && path === 'scripts/data-architecture-guard.mjs')
      continue;
    assert.ok(existsSync(path), `${path} is listed but does not exist`);
  }
});

test('the parallel runner gives the same verdicts as the serial one', async () => {
  const root = mkdtempSync(join(tmpdir(), 'drift-par-'));
  writeFileSync(join(root, 'ok.mjs'), 'process.exit(0)');
  writeFileSync(
    join(root, 'bad.mjs'),
    'console.error("grew"); process.exit(1)'
  );
  writeFileSync(join(root, 'dep.mjs'), 'import "nope-missing-package-xyz"');
  const guards = [
    { id: 'ok', command: ['node', 'ok.mjs'], requires: ['ok.mjs'] },
    { id: 'bad', command: ['node', 'bad.mjs'], remediation: 'fix it' },
    { id: 'dep', command: ['node', 'dep.mjs'] },
    { id: 'gone', command: ['node', 'gone.mjs'], requires: ['gone.mjs'] },
  ];
  const results = await runGuardsParallel({ guards, root });
  assert.deepEqual(
    results.map(r => r.status),
    ['pass', 'fail', 'error', 'skipped']
  );
  assert.match(results[1].detail, /grew/);
});
