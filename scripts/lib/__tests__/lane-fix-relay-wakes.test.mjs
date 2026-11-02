import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '../../..');
const workflow = load(
  readFileSync(resolve(root, '.github/workflows/lane-fix-relay.yml'), 'utf8')
);
const condition = String(workflow.jobs.relay.if);

// Lane Fix Relay ran about 125 times an hour, ~336 successful wakes in 3 hours, each paying a
// 20 s debounce, a checkout, an App mint and github.token calls. Green wakes now come only from
// Source Validation, the slowest required producer; every failure signal still wakes.
test('a green wake needs Source Validation; failures wake from every listed workflow', () => {
  assert.match(
    condition,
    /conclusion == 'success' && github\.event\.workflow_run\.name == 'Source Validation'/
  );
  // No bare "success" in the generic conclusion list any more.
  assert.match(
    condition,
    /fromJSON\('\["failure","timed_out","startup_failure"\]'\)/
  );
  assert.doesNotMatch(
    condition,
    /\["failure","timed_out","startup_failure","success"\]/
  );
  // Failures keep waking from every workflow the relay subscribes to.
  assert.ok(workflow.on.workflow_run.workflows.includes('Source Validation'));
  assert.ok(workflow.on.workflow_run.workflows.includes('PR Fleet Rules'));
  assert.ok(workflow.on.workflow_run.workflows.length >= 9);
});

test('main-branch failure wakes and the non-workflow_run signals are unchanged', () => {
  assert.match(condition, /github\.event_name == 'deployment_status'/);
  assert.match(condition, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(condition, /"cancelled"/);
  assert.match(condition, /"push"/);
});

test('the actual sparse relay checkout can wake through the shared API policy', () => {
  const checkout = workflow.jobs.relay.steps.find(
    step => step.name === 'Checkout trusted lane policy'
  );
  assert.ok(checkout, 'relay must declare its trusted sparse checkout');
  const paths = checkout.with['sparse-checkout'].trim().split(/\s*\n\s*/u);
  const scratch = mkdtempSync(join(tmpdir(), 'relay-sparse-wake-'));
  const fixture = join(scratch, 'checkout');
  const git = (cwd, args) => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git(scratch, ['clone', '--shared', '--no-checkout', root, fixture]);
    // Mirror the pinned actions/checkout implementation, including its mode:
    // non-cone writes patterns before checkout; cone passes paths to Git set.
    if (checkout.with['sparse-checkout-cone-mode'] === false) {
      git(fixture, ['config', 'core.sparseCheckout', 'true']);
      const patterns = git(fixture, [
        'rev-parse',
        '--git-path',
        'info/sparse-checkout',
      ]);
      appendFileSync(resolve(fixture, patterns), `\n${paths.join('\n')}\n`);
    } else {
      git(fixture, ['sparse-checkout', 'set', ...paths]);
    }
    git(fixture, ['checkout', '--detach', 'HEAD']);
    const bin = join(scratch, 'bin');
    mkdirSync(bin);
    const gh = join(bin, 'gh');
    const calls = join(scratch, 'calls');
    const ledger = join(scratch, 'ledger');
    writeFileSync(
      gh,
      '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$RELAY_WAKE_CALLS"\n'
    );
    chmodSync(gh, 0o755);
    const code = [
      'import socket, sys',
      'from pathlib import Path',
      'def denied(*args, **kwargs): raise AssertionError("network forbidden in relay fixture")',
      'socket.socket.connect = denied',
      'sys.path.insert(0, str(Path("scripts/lanes").resolve()))',
      'import pr_events',
      'assert pr_events.wake_green_enroll(7) is True',
    ].join('\n');
    const run = () =>
      spawnSync(process.env.PYTHON3 || 'python3', ['-c', code], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 15000,
        env: {
          PATH: `${bin}:${process.env.PATH || '/usr/bin:/bin'}`,
          JOVIE_API_STATE_DIR: ledger,
          RELAY_WAKE_CALLS: calls,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          PYTHONDONTWRITEBYTECODE: '1',
        },
      });
    const positive = run();
    assert.equal(positive.status, 0, positive.stderr);
    const expected =
      'workflow run merge-queue-green-enroll.yml --repo JovieInc/Jovie --ref main -f pr_number=7\n';
    assert.equal(readFileSync(calls, 'utf8'), expected);
    const budget = JSON.parse(
      readFileSync(join(ledger, 'api-ledger/github.json'), 'utf8')
    );
    assert.equal(budget.provider, 'github');
    assert.ok(budget.credentials['gh-cli-login']);
    // Missing or corrupt policy must fail before another gh call, not bypass it.
    const policy = join(fixture, 'packages/api-client/providers.json');
    rmSync(policy);
    const missing = run();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /FileNotFoundError.*providers\.json/u);
    writeFileSync(policy, '{malformed');
    const corrupt = run();
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /JSONDecodeError/u);
    assert.equal(readFileSync(calls, 'utf8'), expected);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
