import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = load(
  readFileSync('.github/workflows/eval-real-model.yml', 'utf8')
);
const step = workflow.jobs['real-model-eval'].steps.find(
  item => item.name === 'Construct explicit live-model eligibility'
);

function construct(event, account, provider, cap) {
  assert.ok(
    step,
    'workflow must construct manual eligibility before running live suites'
  );
  const dir = mkdtempSync(join(tmpdir(), 'real-eval-eligibility-'));
  const envFile = join(dir, 'env');
  try {
    const result = spawnSync('bash', ['-eo', 'pipefail', '-c', step.run], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_ENV: envFile,
        GITHUB_EVENT_NAME: event,
        ELIGIBILITY_ACCOUNT: account,
        ELIGIBILITY_PROVIDER: provider,
        ELIGIBILITY_CAP_USD: cap,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .trimEnd()
        .split('\n')
        .map(line => [
          line.slice(0, line.indexOf('=')),
          line.slice(line.indexOf('=') + 1),
        ])
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('workflow defaults to disabled and exposes explicit account/provider authorization', () => {
  assert.equal(workflow.env.JOVIE_RUN_REAL_MODEL_EVALS, '');
  for (const name of [
    'cost_eligibility_account',
    'cost_eligibility_provider',
  ]) {
    assert.equal(workflow.on.workflow_dispatch.inputs[name].default, '');
  }
  const run = workflow.jobs['real-model-eval'].steps.find(item =>
    item.name?.startsWith('Run real-model')
  );
  assert.match(run.run, /JOVIE_RUN_REAL_MODEL_EVALS='' pnpm exec vitest/);
});

for (const event of ['push', 'schedule', 'pull_request', 'merge_group']) {
  test(`${event} cannot authorize provider spending`, () => {
    const env = construct(event, 'approved-account', 'gateway', '2');
    assert.equal(env.JOVIE_RUN_REAL_MODEL_EVALS, '');
    assert.equal(env.REAL_EVAL_ELIGIBILITY, '');
  });
}
for (const [account, provider, cap] of [
  ['', 'gateway', '2'],
  ['   ', 'gateway', '2'],
  ['account', '', '2'],
  ['account', '  ', '2'],
  ['account', 'gateway', ''],
  ...['2junk', 'NaN', 'Infinity', '0', '-1', '25.01'].map(value => [
    'account',
    'gateway',
    value,
  ]),
]) {
  test(`invalid manual eligibility is disabled: ${JSON.stringify([account, provider, cap])}`, () => {
    const env = construct('workflow_dispatch', account, provider, cap);
    assert.equal(env.JOVIE_RUN_REAL_MODEL_EVALS, '');
    assert.equal(env.REAL_EVAL_ELIGIBILITY, '');
  });
}
for (const cap of ['0.5', '25']) {
  test(`explicit manual eligibility respects bounded cap ${cap}`, () => {
    const env = construct('workflow_dispatch', ' account ', ' gateway ', cap);
    assert.equal(env.JOVIE_RUN_REAL_MODEL_EVALS, '1');
    assert.equal(env.BUDGET_CAP_USD, cap);
    assert.deepEqual(JSON.parse(env.REAL_EVAL_ELIGIBILITY), {
      account: 'account',
      provider: 'gateway',
      capUsd: Number(cap),
    });
  });
}
test('operator identifiers cannot inject additional GitHub environment variables', () => {
  const env = construct(
    'workflow_dispatch',
    'account\nUNAUTHORIZED=1',
    'gateway',
    '2'
  );
  assert.equal(env.UNAUTHORIZED, undefined);
  assert.equal(
    JSON.parse(env.REAL_EVAL_ELIGIBILITY).account,
    'account\nUNAUTHORIZED=1'
  );
});
