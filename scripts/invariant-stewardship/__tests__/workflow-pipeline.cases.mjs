import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('workflow regenerates and validates current source without promoting history', () => {
  const workflow = fs.readFileSync(
    '.github/workflows/design-governance.yml',
    'utf8'
  );
  const step = workflow
    .split('      - name: Validate current-week invariant stewardship state')[1]
    ?.split('\n      - name:')[0];
  assert.ok(step, 'existing stewardship consumer must remain present');
  const run = step.match(/\n {8}run: ([^\n]+)\n?/);
  assert.ok(run, 'execute the actual workflow producer and consumer');
  const command =
    run[1] === '|'
      ? step
          .slice(run.index + run[0].length)
          .split('\n')
          .map(line => line.replace(/^ {10}/, ''))
          .join('\n')
      : run[1];
  // GitHub's explicit bash uses pipefail; its unspecified shell uses only -e.
  const shell = /\n\s+shell: bash\s*\n/.test(step)
    ? ['--noprofile', '--norc', '-eo', 'pipefail']
    : ['-e'];
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'stewardship-workflow-')
  );
  try {
    const checkout = path.join(directory, 'checkout');
    fs.mkdirSync(checkout);
    for (const file of [
      'package.json',
      'canon/invariants.jsonl',
      'scripts/invariant-stewardship/audit.mjs',
      'scripts/invariant-stewardship/historical-audit.mjs',
      'scripts/invariants/growth-learning-policy.mjs',
      'scripts/lib/learning-trigger.mjs',
      'apps/web/lib/ovie/invariant-stewardship.js',
      'apps/web/lib/ovie/generated/invariant-stewardship.current-week.json',
    ]) {
      const destination = path.join(checkout, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(file, destination);
    }
    const snapshot = path.join(
      checkout,
      'apps/web/lib/ovie/generated/invariant-stewardship.current-week.json'
    );
    const history = fs.readFileSync(snapshot, 'utf8');
    const clock = path.join(directory, 'clock.mjs');
    fs.writeFileSync(
      clock,
      `const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-11-17T02:00:00.000Z'])); }
  static now() { return new NativeDate('2026-11-17T02:00:00.000Z').getTime(); }
};\n`
    );
    /** @type {NodeJS.ProcessEnv} */
    const env = {
      ...process.env,
      GITHUB_REPOSITORY: 'fixture/stewardship',
      GITHUB_EVENT_NAME: 'push',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${JSON.stringify(clock)}`,
    };
    // A parent hook's Git routing must never let fixture commits touch its repo.
    const localGitNames = spawnSync('git', ['rev-parse', '--local-env-vars'], {
      encoding: 'utf8',
    });
    assert.equal(localGitNames.status, 0, localGitNames.stderr);
    for (const name of localGitNames.stdout.trim().split('\n'))
      delete env[name];
    /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
    const options = {
      cwd: checkout,
      encoding: 'utf8',
      env,
    };
    const git = (...args) => {
      const result = spawnSync('git', args, options);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git('init', '--quiet');
    git('add', '.');
    const commit = () => {
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'fixture source revision'
      );
      env.GITHUB_SHA = git('rev-parse', 'HEAD');
    };
    commit();
    const execute = script =>
      spawnSync('bash', [...shell, '-c', script], options);
    const reportPath = path.join(checkout, 'invariant-stewardship-audit.json');
    const candidatePath = path.join(
      checkout,
      'invariant-stewardship.source-bound.json'
    );
    const first = execute(command);
    assert.equal(
      first.status,
      0,
      `actual workflow must produce current evidence: ${first.stderr}`
    );
    const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    const report = () => JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(report().evidence.state, 'verified');
    assert.equal(report().evidence.executionStatus, 'not-certified');
    assert.equal(report().growthLearning.admissionEligible, false);
    assert.equal(report().drillDown, 'canon/invariants.jsonl');
    assert.deepEqual(candidate.causalEvent, {
      kind: 'source-change',
      id: `git:${env.GITHUB_REPOSITORY}:${env.GITHUB_SHA}`,
      sourceRevision: env.GITHUB_SHA,
    });
    assert.ok(candidate.facts.length > 0);
    assert.equal(candidate.growthLearningIntake, undefined);
    assert.equal(fs.readFileSync(snapshot, 'utf8'), history);
    assert.match(
      workflow,
      /path: \|\n\s+invariant-stewardship-audit\.json\n\s+invariant-stewardship\.source-bound\.json/
    );

    const consumer = command
      .split('\n')
      .find(line => /^node .*audit\.mjs --input .*\| tee /.test(line));
    assert.ok(
      consumer,
      'execute the unchanged workflow consumer after tampering'
    );
    for (const eventName of [
      'pull_request',
      'repository_dispatch',
      'workflow_dispatch',
    ]) {
      env.GITHUB_EVENT_NAME = eventName;
      const redelivery = execute(command);
      assert.equal(redelivery.status, 0, redelivery.stderr);
      assert.deepEqual(
        JSON.parse(fs.readFileSync(candidatePath, 'utf8')).causalEvent,
        candidate.causalEvent,
        'redelivery observes the same Git source cause'
      );
    }
    const actualRevision = env.GITHUB_SHA;
    env.GITHUB_SHA = '0'.repeat(40);
    const mismatched = execute(command);
    assert.equal(mismatched.status, 1);
    assert.match(
      mismatched.stderr,
      /source revision does not match checked-out HEAD/
    );
    env.GITHUB_SHA = actualRevision;

    const canonPath = path.join(checkout, 'canon/invariants.jsonl');
    const rows = fs
      .readFileSync(canonPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    rows[1].effective.version += 1;
    rows[1].policy.value = {
      ...rows[1].policy.value,
      workflowFixtureRevision: 2,
    };
    fs.writeFileSync(
      canonPath,
      `${rows.map(row => JSON.stringify(row)).join('\n')}\n`
    );
    const stale = execute(consumer);
    assert.equal(
      stale.status,
      1,
      'tee must propagate source-change invalidation'
    );
    assert.equal(report().evidence.state, 'stale');
    assert.equal(report().summary.actionableExceptions, 0);
    const dirtySource = execute(command);
    assert.equal(dirtySource.status, 1);
    assert.match(
      dirtySource.stderr,
      /Canonical source differs from checked-out revision/
    );
    git('add', 'canon/invariants.jsonl');
    commit();
    const recovered = execute(command);
    assert.equal(recovered.status, 0, recovered.stderr);
    const regenerated = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    assert.notEqual(
      regenerated.sourceBinding.digest,
      candidate.sourceBinding.digest
    );
    assert.equal(regenerated.causalEvent.sourceRevision, env.GITHUB_SHA);
    assert.equal(report().evidence.state, 'verified');

    delete regenerated.sourceBinding;
    fs.writeFileSync(candidatePath, JSON.stringify(regenerated));
    const unbound = execute(consumer);
    assert.equal(
      unbound.status,
      1,
      'tee must propagate unbound current rejection'
    );
    assert.equal(report().evidence.state, 'invalid');
    assert.equal(report().summary.actionableExceptions, 0);
    const historical = execute('node scripts/invariant-stewardship/audit.mjs');
    assert.equal(historical.status, 1);
    assert.match(historical.stderr, /historical-receipt-source-unbound/);
    assert.equal(JSON.parse(historical.stdout).evidence.state, 'historical');
    assert.equal(fs.readFileSync(snapshot, 'utf8'), history);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
