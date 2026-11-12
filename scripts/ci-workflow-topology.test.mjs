// biome-ignore-all format: compact regression controls keep the guarded PR under 500 lines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { load as yamlLoad } from 'js-yaml';
import { buildTopology, findCycle, syncTopology, validateTopology } from './ci-workflow-topology.mjs';
import { scan as scanAiReviewBoundary } from './company-guards/ai-review-boundary.mjs';
import { evaluateIf, jobName, loadPolicy, loadWorkflows, parityClock, requiredContexts, validateQueueParity } from './lib/queue-parity.mjs';

test('Pen drafts share one editor across runs and retain pending frame jobs', () => {
  const workflow = /** @type {{jobs: {draft: {concurrency: unknown, strategy: {'max-parallel': number}}}, concurrency: {group: string}}} */ (yamlLoad(fs.readFileSync('.github/workflows/pen-draft.yml', 'utf8')));
  assert.deepEqual(workflow.jobs.draft.concurrency, {
    group: 'pen-draft-canonical-editor',
    'cancel-in-progress': false,
    queue: 'max',
  });
  assert.equal(workflow.jobs.draft.strategy['max-parallel'], 1);
  assert.match(workflow.concurrency.group, /github\.event\.pull_request\.number/);
  assert.match(workflow.concurrency.group, /github\.sha/);
});

test('repository workflows satisfy the topology and fan-out contract', () => {
  const { policy, nodes, edges } = buildTopology();
  assert.equal(nodes.find(node => node.name === 'Test Coverage Audit')?.category, 'source-validation');
  assert.equal(nodes.find(node => node.name === 'Main Health')?.category, 'source-validation');
  assert.deepEqual(edges.filter(edge => edge.from === 'Main Health'),
    [{ from: 'Main Health', to: 'Main Red Eject', type: 'workflow_run' }]);
  assert.deepEqual(validateTopology({ policy, nodes, edges }).errors, []);
  const observers = new Set(nodes.filter(node => node.active && node.category === 'telemetry-aggregation').map(node => node.name));
  assert.equal(edges.some(edge => edge.type === 'workflow_run' && observers.has(edge.from)), false);
  for (const producer of ['Source Validation', 'Fork PR Gate', 'PR Size Guard']) {
    assert.deepEqual(edges.filter(edge => edge.from === producer &&
      nodes.find(node => node.name === edge.to)?.category === 'remediation-dispatch'),
    [{ from: producer, to: 'Lane Fix Relay', type: 'workflow_run' }],
    `${producer} must deliver completion to the single repair owner`);
  }
});
test('rejects cycles, duplicate owners, and budget regressions', () => {
  assert.deepEqual(findCycle(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]), ['a', 'b', 'a']);
  const topology = buildTopology();
  topology.policy.authoritativeOwners.push({ category: 'telemetry-aggregation', workflow: 'CI' });
  topology.policy.authoritySurfaces.push(topology.policy.authoritySurfaces[0]);
  topology.policy.budgets.normalPrCheckRecords = 1;
  topology.policy.budgets.mainShaWorkflowRuns = topology.policy.measuredBaseline.workflowRuns;
  const errors = validateTopology(topology).errors.join('\n');
  assert.match(errors, /exactly one authoritative owner/);
  assert.match(errors, /authority surfaces must have exactly one owner/);
  assert.match(errors, /normal PR check budget exceeded/);
  assert.match(errors, /did not fall by at least 75%/);
});

test('workflow yaml is parsed into name, triggers and job topology (JOV-7290)', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'topology-'));
  const dir = path.join(fixture, '.github/workflows');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'producer.yml'), 'name: Producer\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest\n');
  fs.writeFileSync(path.join(dir, 'consumer.yml'), 'name: Consumer\non:\n  workflow_run:\n    workflows: [Producer]\n    types: [completed]\njobs:\n  audit:\n    runs-on: ubuntu-latest\n  report:\n    runs-on: ubuntu-latest\n');
  const policy = {
    measuredBaseline: { workflowRuns: 4 },
    budgets: { blockingPrChecks: 1, normalPrCheckRecords: 10, normalPrExternalAllowance: 0, mainShaWorkflowRuns: 1 },
    authoritativeOwners: [{ category: 'source-validation', workflow: 'Producer' }],
    authoritySurfaces: [],
    blockingPrChecks: [],
    normalPrWorkflows: [],
    inactiveWorkflows: [],
  };
  const { nodes, edges } = buildTopology(fixture, policy);
  const consumer = nodes.find(node => node.name === 'Consumer');
  assert.equal(nodes.length, 2);
  assert.equal(consumer?.jobCount, 2);
  assert.equal(consumer?.terminalReceipt, 'job:report');
  assert.deepEqual(consumer?.triggeringStateTransition, ['workflow_run']);
  assert.deepEqual(edges, [{ from: 'Producer', to: 'Consumer', type: 'workflow_run' }]);
  fs.rmSync(fixture, { recursive: true, force: true });
});

test('release opportunity requires one staging completion path and rejects parallel CI or duplicate triggers', () => {
  for (const edge of [{ from: 'CI', to: 'Production Controller', type: 'workflow_run' }, { from: 'Staging Controller', to: 'Production Controller', type: 'workflow_run' }]) {
    const topology = buildTopology(); topology.edges.push(edge);
    assert.match(validateTopology(topology).errors.join('\n'), /exactly one Production Controller opportunity through completed staging/);
  }
  const topology = buildTopology(); topology.edges = topology.edges.filter(edge => edge.to !== 'Staging Controller');
  assert.match(validateTopology(topology).errors.join('\n'), /exactly one Production Controller opportunity through completed staging/);
});

test('committed workflow DAG stays synchronized with the workflows', () => {
  assert.deepEqual(syncTopology().errors, []);
});

test('generator detects missing and stale DAGs, refreshes deterministically, and preserves output on invalid workflows', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'topology-sync-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const workflows = path.join(fixture, '.github/workflows');
  fs.cpSync(new URL('../.github/workflows', import.meta.url), workflows, { recursive: true });
  fs.copyFileSync(new URL('../.github/runner-pin-allowlist.json', import.meta.url), path.join(fixture, '.github/runner-pin-allowlist.json'));
  const output = path.join(fixture, '.github/workflow-topology.gen.yml');
  const stale = /generated workflow DAG is stale/;
  assert.match(syncTopology(fixture).errors.join('\n'), stale);
  assert.equal(fs.existsSync(output), false, 'check mode must not write');
  assert.deepEqual(syncTopology(fixture, true).errors, []);
  const initial = fs.readFileSync(output, 'utf8');
  assert.deepEqual(syncTopology(fixture).errors, []);
  assert.deepEqual(syncTopology(fixture, true).errors, []);
  assert.equal(fs.readFileSync(output, 'utf8'), initial);

  const controller = path.join(workflows, 'production-controller.yml');
  const source = fs.readFileSync(controller, 'utf8');
  fs.writeFileSync(controller, source + '\n  topology-regression:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: "true"\n');
  assert.match(syncTopology(fixture).errors.join('\n'), stale);
  assert.equal(fs.readFileSync(output, 'utf8'), initial, 'stale check must not rewrite');
  assert.deepEqual(syncTopology(fixture, true).errors, []);
  assert.deepEqual(syncTopology(fixture).errors, []);
  const updated = fs.readFileSync(output, 'utf8');
  assert.notEqual(updated, initial);

  fs.copyFileSync(controller, path.join(workflows, 'duplicate-controller.yml'));
  assert.match(syncTopology(fixture, true).errors.join('\n'), /workflow names must be present and unique/);
  assert.equal(fs.readFileSync(output, 'utf8'), updated, 'invalid topology must not replace the last valid DAG');
});

test('AI review stays advisory: blocking reviewers fail the boundary scan', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'topology-ai-review-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const workflows = path.join(fixture, '.github/workflows');
  fs.mkdirSync(workflows, { recursive: true });
  fs.writeFileSync(
    path.join(workflows, 'advisory.yml'),
    'name: Advisory AI Review\non:\n  pull_request:\njobs:\n  review:\n    steps:\n      - run: node .github/scripts/advisory-ai-review.mjs\n',
  );
  assert.deepEqual(scanAiReviewBoundary(fixture), []);
  fs.writeFileSync(
    path.join(workflows, 'warden.yml'),
    'name: Warden\non: [pull_request]\njobs:\n  review:\n    steps:\n      - run: gh pr review $PR --request-changes\n      - run: warden --fail-on findings\n',
  );
  const flagged = scanAiReviewBoundary(fixture);
  assert.equal(flagged.length, 1, JSON.stringify(flagged));
  assert.match(flagged[0].file, /warden\.yml$/);
  assert.match(flagged[0].signal, /request-changes/);
});


// ---- Trigger budget (audit finding 4): runs start only when work can happen ----
const workflowYaml = file => /** @type {any} */ (yamlLoad(fs.readFileSync(`.github/workflows/${file}`, 'utf8')));

test('trigger budget: always-skipped hops start no run of their own', () => {
  // 2026-11-11: these four started ~3,900 runs a week; all but a handful skipped.
  const guard = workflowYaml('auto-merge-base-guard.yml');
  assert.deepEqual(guard.on.pull_request_target['branches-ignore'], ['main']);
  assert.deepEqual(Object.keys(workflowYaml('cheap-fixer.yml').on), ['workflow_call']);
  const audit = workflowYaml('security-suppression-audit.yml');
  assert.deepEqual(audit.on.pull_request_review.types, ['edited', 'dismissed']);
  assert.ok('workflow_call' in audit.on && 'workflow_dispatch' in audit.on);
  assert.match(audit.concurrency['cancel-in-progress'], /github\.workflow == 'Security Suppression Audit'/);
  const scrub = workflowYaml('legacy-human-hold-scrub.yml');
  assert.deepEqual(Object.keys(scrub.on).sort(), ['label', 'push', 'workflow_dispatch']);
  // Lane Fix Relay already wakes on the events the hosted hops need.
  const relay = workflowYaml('lane-fix-relay.yml');
  const ran = relay.on.workflow_run.workflows;
  for (const name of ['Source Validation', 'CI', 'Changed-Evidence Test Suites']) assert.ok(ran.includes(name), name);
  assert.equal(relay.jobs['cheap-fix'].uses, './.github/workflows/cheap-fixer.yml');
  assert.match(relay.jobs['cheap-fix'].if, /vars\.CHEAP_FIXER_MODE == 'shadow'/);
  assert.match(relay.jobs['cheap-fix'].if, /github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.deepEqual(relay.on.pull_request_review.types, ['submitted']);
  assert.equal(relay.jobs['security-suppression-audit'].uses, './.github/workflows/security-suppression-audit.yml');
  assert.match(relay.jobs['security-suppression-audit'].if, /github\.event\.action == 'submitted'/);
});
// ---- end trigger budget ----

// Queue parity (audit finding 2, .github/MERGE_QUEUE.md "Queue parity"): the
// queue re-checks the combined head; it is not where a PR's own checks first run.
test('every merge_group-required job has a required PR twin or a dated exemption, and PR-only inputs stay off the queue', () => {
  const policy = loadPolicy();
  const result = validateQueueParity({ workflows: loadWorkflows(), contexts: requiredContexts(), policy });
  assert.deepEqual(result.errors, []);
  assert.ok(result.queueRequired.includes('ci.yml#ci-merge-group-ready'));
  assert.ok(result.prRequired.includes('source-validation.yml#ready'));
  assert.equal(parityClock(policy, {}).toISOString().slice(0, 10),
    [...policy.exemptions, ...policy.prOnlyExemptions].map(e => e.createdOn).sort().at(-1),
    'expiry reads the newest createdOn, not the wall clock, outside the time-bomb scan');
});

test('queue parity evaluates if: per event with unknowns kept unknown', () => {
  assert.equal(evaluateIf("github.event_name == 'merge_group'", 'merge_group'), true);
  assert.equal(evaluateIf("${{ github.event_name == 'workflow_dispatch' && inputs.x == true }}", 'merge_group'), false);
  assert.equal(evaluateIf("always() && (github.event_name != 'merge_group' || needs.a.result == 'success')", 'merge_group'), null);
  assert.equal(evaluateIf("!cancelled() && needs.a.result == 'success'", 'pull_request'), null);
  assert.equal(evaluateIf("github.event_name == 'pull_request' && startsWith(github.head_ref, 'x')", 'merge_group'), false);
  assert.equal(evaluateIf(undefined, 'merge_group'), true);
  const job = { name: "${{ github.event_name == 'merge_group' && 'PR Ready' || 'PR Ready (merge-group inactive)' }}" };
  assert.equal(jobName(job, 'ready', 'merge_group'), 'PR Ready');
  assert.equal(jobName(job, 'ready', 'pull_request'), 'PR Ready (merge-group inactive)');
});

test('queue parity rejects queue-only jobs, missing commands, PR-only inputs on the queue, and lapsed exemptions', () => {
  const run = cmd => ({ 'runs-on': 'ubuntu-24.04', steps: [{ run: cmd }] });
  const workflows = new Map([
    ['ci.yml', { on: { merge_group: {} }, jobs: {
      lint: run('pnpm lint'),
      e2e: run('pnpm e2e'),
      size: run('node size.mjs'),
      ready: { name: "${{ github.event_name == 'merge_group' && 'PR Ready' || 'x' }}", needs: ['lint', 'e2e', 'size'], ...run('true') },
      manual: { if: "github.event_name == 'workflow_dispatch'", ...run('pnpm manual') },
    } }],
    ['pr.yml', { on: { pull_request: {} }, jobs: { lint: run('pnpm lint && pnpm format'), sizeguard: run('node size.mjs'), ready: { name: 'PR Ready', needs: ['lint', 'sizeguard'], ...run('true') } } }],
  ]);
  const base = {
    parity: { 'ci.yml#lint': { pr: 'pr.yml#lint', command: 'pnpm lint' } },
    exemptions: [{ job: 'ci.yml#e2e', kind: 'gap', reason: 'Browser e2e runs only in the queue; a PR job should run it.', createdOn: '2026-11-01', expiresOn: '2026-12-01' },
      { job: 'ci.yml#ready', kind: 'combined-head', reason: 'Aggregates the combined-head leaves into the queue PR Ready context.', createdOn: '2026-10-20', expiresOn: '2026-12-01' }],
    prOnlyInputs: [{ job: 'ci.yml#size', pr: 'pr.yml#sizeguard', why: 'Measures only the PR diff size.' }],
    prOnlyExemptions: [{ job: 'ci.yml#size', reason: 'Still carries an admission-time label check that must move first.', createdOn: '2026-11-01', expiresOn: '2026-12-01' }],
  };
  const check = (policy, asOf = new Date('2026-11-15T00:00:00Z')) =>
    validateQueueParity({ workflows, contexts: ['PR Ready'], policy, asOf }).errors.join('\n');
  assert.equal(check(base), '');
  const ready = check({ ...base, exemptions: [] }, new Date('2026-10-20T00:00:00Z'));
  assert.match(ready, /ci\.yml#e2e: required on merge_group with no matching required pull_request job/);
  assert.match(ready, /ci\.yml#ready: required on merge_group/, 'the aggregate itself needs a classification');
  assert.match(check({ ...base, parity: { 'ci.yml#lint': { pr: 'pr.yml#lint', command: 'pnpm typecheck' } } }), /shared command "pnpm typecheck" is not in ci\.yml#lint/);
  assert.match(check({ ...base, prOnlyExemptions: [] }), /ci\.yml#size: reads only the PR .* but runs on merge_group/);
  assert.match(check({ ...base, prOnlyInputs: [{ ...base.prOnlyInputs[0], pr: 'pr.yml#missing' }] }), /must stay required on pull_request/);
  assert.match(check(base, new Date('2026-12-02T00:00:00Z')), /ci\.yml#e2e: exemption expired on 2026-12-01/);
  const withE2e = e2e => ({ ...base, exemptions: [{ ...base.exemptions[0], ...e2e }, base.exemptions[1]] });
  assert.match(check(withE2e({ expiresOn: '2027-03-01' })), /lifetime must be 0 to 90 days/);
  assert.match(check(withE2e({ reason: 'later' })), /reason must say/);
  assert.match(check(withE2e({ kind: 'someday' })), /exemption kind must be/);
  assert.match(check({ ...base, exemptions: [...base.exemptions, { ...base.exemptions[0], job: 'ci.yml#manual' }] }), /ci\.yml#manual: stale exemption/);
  assert.match(check(base).concat(validateQueueParity({ workflows, contexts: ['PR Ready', 'Gone'], policy: base, asOf: new Date('2026-11-15T00:00:00Z') }).errors.join('\n')), /"Gone" has no producing job on pull_request/);
  assert.equal(parityClock(base, {}).toISOString(), '2026-11-01T00:00:00.000Z');
  assert.ok(parityClock(base, { CALENDAR_DEADLINE_SCAN: '1' }) instanceof Date);
});

test('queue parity matches shared commands with quotes, backslashes and extra spaces as written', () => {
  const step = cmd => ({ 'runs-on': 'ubuntu-24.04', steps: [{ run: cmd }] });
  const command = 'node gate.mjs --label "ship it" --re a\\.b';
  const workflows = new Map([
    ['ci.yml', { on: { merge_group: {} }, jobs: { gate: { name: 'Gate', ...step(`set -e\n${command.replace(' --re', '   --re')}`) } } }],
    ['pr.yml', { on: { pull_request: {} }, jobs: { gate: { name: 'Gate', ...step(command) } } }],
  ]);
  const policy = { parity: { 'ci.yml#gate': { pr: 'pr.yml#gate', command } }, exemptions: [], prOnlyInputs: [], prOnlyExemptions: [] };
  assert.deepEqual(validateQueueParity({ workflows, contexts: ['Gate'], policy, asOf: new Date('2026-11-15T00:00:00Z') }).errors, []);
});

// ---- Trigger registry (audit finding 4): fan-out needs a declared budget ----
test('trigger registry: every workflow declares its triggers within the run budget', async () => {
  const { checkRegistry, readRegistry, scanWorkflows } = await import('./lib/ci-trigger-registry.mjs');
  const { errors, expectedRunsPerMergedPr } = checkRegistry(readRegistry('.'), scanWorkflows('.'));
  assert.deepEqual(errors, [], 'run: node scripts/ci-trigger-registry.mjs --write, then fill runsPerMergedPr');
  assert.ok(expectedRunsPerMergedPr > 0);
});

test('trigger registry: a new workflow_run, edited or labeled trigger fails until registered', async t => {
  const { checkRegistry, isFanOut, scanWorkflows } = await import('./lib/ci-trigger-registry.mjs');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'trigger-registry-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const dir = path.join(fixture, '.github/workflows');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.yml'), 'name: A\non:\n  push:\n  workflow_run:\n    workflows: [CI]\n    types: [completed]\n');
  fs.writeFileSync(path.join(dir, 'b.yml'), 'name: B\non:\n  pull_request:\n    types: [opened, edited, labeled]\n');
  const scanned = scanWorkflows(fixture);
  assert.deepEqual(scanned['a.yml'], ['push', 'workflow_run:CI']);
  assert.deepEqual(scanned['b.yml'].filter(isFanOut), ['pull_request:edited', 'pull_request:labeled']);
  const budget = { runsPerMergedPr: 60, ceiling: 5 };
  const registered = { budget, workflows: { 'a.yml': { triggers: ['push'], runsPerMergedPr: 1 } } };
  const { errors } = checkRegistry(registered, scanned);
  assert.ok(errors.some(e => /a\.yml: trigger workflow_run:CI \(fan-out\) is not registered/.test(e)), errors.join('\n'));
  assert.ok(errors.some(e => /b\.yml: not in .*fan-out: pull_request:edited, pull_request:labeled/.test(e)), errors.join('\n'));
  const complete = { budget, workflows: { 'a.yml': { triggers: scanned['a.yml'], runsPerMergedPr: 2 }, 'b.yml': { triggers: scanned['b.yml'], runsPerMergedPr: 2 } } };
  assert.deepEqual(checkRegistry(complete, scanned).errors, []);
  complete.workflows['b.yml'].runsPerMergedPr = 4;
  assert.match(checkRegistry(complete, scanned).errors.join('\n'), /declared 6 runs per merged PR exceeds the ceiling 5/);
  complete.workflows['b.yml'].runsPerMergedPr = null;
  assert.match(checkRegistry(complete, scanned).errors.join('\n'), /b\.yml: runsPerMergedPr must be a number/);
});
// ---- end trigger registry ----
