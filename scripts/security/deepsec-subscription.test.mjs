import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  admitSubscription,
  subscriptionEnvironment,
  subscriptionPlan,
  subscriptionReceipt,
} from './deepsec-subscription.mjs';

const sha = 'a'.repeat(40);
const input = {
  sourceRoot: '/tmp/source',
  workspace: '/tmp/scanner',
  headSha: sha,
  files: ['apps/web/lib/auth/better-auth.ts'],
  repository: 'JovieInc/Jovie',
  headRepository: 'JovieInc/Jovie',
};
const plan = subscriptionPlan(input);
const result = (count = 0, analyses = 1) => ({
  status: count ? 1 : 0,
  stdout: `Scanning 1 file(s)…\nProcessing complete. Run: native-1\n  Analyses: ${analyses}\n  Findings: ${count}\n${count ? `${count} new finding(s) — exiting 1` : 'No findings.'}\n`,
});
const finding = {
  metadata: {
    projectId: 'jovie',
    filePath: input.files[0],
    vulnSlug: 'auth-boundary',
    lineNumbers: [11, 10],
    issue: null,
  },
};
const receipt = (overrides = {}) =>
  subscriptionReceipt({
    plan,
    result: result(),
    findings: [],
    observedHead: sha,
    sourceChanged: false,
    ...overrides,
  });

test('subscription execution strips API keys, provider routes and code-loading hooks', () => {
  const environment = {
    PATH: '/bin',
    HOME: '/home/scanner',
    CODEX_HOME: '/home/scanner/.codex',
    LC_ALL: 'C',
    OPENAI_API_KEY: 'blocked',
    AI_GATEWAY_API_KEY: 'blocked',
    ANTHROPIC_AUTH_TOKEN: 'blocked',
    OPENAI_BASE_URL: 'blocked',
    NODE_OPTIONS: '--require malicious',
    NODE_PATH: 'blocked',
    DEEPSEC_INSIDE_SANDBOX: '1',
    GITHUB_TOKEN: 'blocked',
    LINEAR_API_KEY: 'blocked',
    MALFORMED: null,
  };
  assert.deepEqual(subscriptionEnvironment(environment), {
    PATH: '/bin',
    HOME: '/home/scanner',
    CODEX_HOME: '/home/scanner/.codex',
    LC_ALL: 'C',
  });
});

test('pinned native configuration uses the supported direct-process interface', () => {
  assert.deepEqual(plan.config.ai, { mode: 'local', provider: 'local' });
  assert.equal(plan.config.defaultAgent, 'codex');
  assert.deepEqual(plan.config.projects[0].root, input.sourceRoot);
  assert.equal(plan.command[plan.command.indexOf('--concurrency') + 1], '1');
  assert.equal(plan.command[plan.command.indexOf('--limit') + 1], '1');
  assert.ok(!plan.command.includes('--model-auth'));
  assert.ok(!plan.command.includes('--ai-api-key-env'));
  assert.ok(!plan.command.includes('--ai-base-url'));
  assert.match(plan.fingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(
    subscriptionPlan({ ...input, headSha: 'b'.repeat(40) }).fingerprint,
    plan.fingerprint
  );
});

test('invalid source, fork, workspace and target rosters cannot dispatch', () => {
  for (const override of [
    { repository: 'other/repo' },
    { headRepository: 'fork/repo' },
    { headSha: 'main' },
    { sourceRoot: 'relative' },
    { workspace: '/tmp/source/scan' },
    { workspace: '/tmp/source' },
    { workspace: '/tmp/scanner/../source' },
    { files: [] },
    { files: ['.env'] },
    { files: [...input.files, ...input.files] },
    { files: null },
  ])
    assert.throws(() => subscriptionPlan({ ...input, ...override }));
});

test('API-key login, unknown status and scanner version drift fail closed', () => {
  const version = { status: 0, stdout: '2.3.10\n' };
  const login = { status: 0, stderr: 'Logged in using ChatGPT\n' };
  assert.equal(admitSubscription({ version, login }), true);
  for (const bad of [
    { status: 0, stdout: 'Logged in using an API key' },
    { status: 1, stderr: 'Logged in using ChatGPT' },
    { status: 0, stdout: '' },
  ])
    assert.throws(() => admitSubscription({ version, login: bad }));
  for (const bad of [
    { status: 0, stdout: '2.3.11' },
    { status: 1, stdout: '2.3.10' },
    {},
  ])
    assert.throws(() => admitSubscription({ version: bad, login }));
});

test('current-head clean, no-candidate and nullable-issue findings receipts are distinct', () => {
  assert.equal(receipt().status, 'clean');
  assert.equal(receipt({ result: result(0, 0) }).status, 'no-candidates');
  assert.equal(
    receipt({ result: result(1), findings: [finding] }).status,
    'findings'
  );
  assert.equal(receipt().headSha, sha);
  assert.equal(receipt().route, 'native-subscription');
});

test('ambiguous native output, quota failure and incomplete exported findings are not a clean scan', () => {
  for (const override of [
    { observedHead: 'b'.repeat(40) },
    { sourceChanged: true },
    { sourceChanged: undefined },
    { result: { ...result(), signal: 'SIGTERM' } },
    { result: { ...result(), error: new Error('timeout') } },
    {
      result: {
        status: 0,
        stdout: 'No files matched. Nothing to process — exit 0.',
      },
    },
    { result: { ...result(), status: 1 } },
    {
      result: { ...result(), stdout: result().stdout + 'Errored batches: 1\n' },
    },
    {
      result: {
        ...result(),
        stdout: result().stdout + 'usage limit reached\n',
      },
    },
    { result: result(0, 2) },
    {
      result: {
        ...result(),
        stdout: result().stdout.replace('Scanning 1', 'Scanning 2'),
      },
    },
    {
      result: {
        ...result(),
        stdout: result().stdout.replace(
          '  Findings: 0',
          '  Findings: 0\n  Findings: 0'
        ),
      },
    },
    { findings: null },
    { result: result(1), findings: [] },
    { result: result(1), findings: [null] },
  ])
    assert.throws(() => receipt(override));
});

test('foreign, malformed and duplicate findings cannot receive source-bound receipts', () => {
  for (const metadata of [
    { ...finding.metadata, projectId: 'other' },
    { ...finding.metadata, filePath: '.env' },
    { ...finding.metadata, vulnSlug: '' },
    { ...finding.metadata, lineNumbers: [] },
    { ...finding.metadata, lineNumbers: [-1] },
  ])
    assert.throws(() =>
      receipt({ result: result(1), findings: [{ metadata }] })
    );
  assert.throws(
    () => receipt({ result: result(2), findings: [finding, finding] }),
    /duplicate/
  );
});
