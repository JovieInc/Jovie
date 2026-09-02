import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  attestPilot,
  disablePilot,
  isControlActive,
  PILOT_ATTESTATION_SCHEMA,
  PILOT_CONTROL_SCHEMA,
  PILOT_RECEIPT_SCHEMA,
  runPilot,
  validateActivationPolicy,
} from './continuous-audit-pilot.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const NOW = '2026-09-02T12:00:00.000Z';
const ENV = {
  GITHUB_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_CURRENT_MAIN_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

async function policy() {
  return JSON.parse(
    await readFile(
      path.join(repoRoot, 'audits/continuous/activation.json'),
      'utf8'
    )
  );
}

function auditResult(overrides = {}) {
  return {
    valid: true,
    registryId: 'jovie-continuous-audit-registry',
    familyCount: 13,
    partitionCount: 27,
    auditedTrackedFileCount: 11055,
    unmappedTrackedFileCount: 0,
    hyperagent: 'unqualified-fail-closed',
    schedule: 'proposal-only',
    ...overrides,
  };
}

async function fixture() {
  const stateDir = await mkdtemp(
    path.join(tmpdir(), 'continuous-audit-pilot-')
  );
  return {
    policy: await policy(),
    stateDir,
    receiptFile: path.join(stateDir, 'artifact', 'receipt.json'),
    env: ENV,
    now: () => NOW,
  };
}

test('the checked-in activation policy preserves every founder boundary', async () => {
  assert.equal(validateActivationPolicy(await policy()).host, 'gem');
});

test('a valid audit closes its host lease after terminal attestation', async () => {
  const input = await fixture();
  const receipt = await runPilot({
    ...input,
    executeAudit: async () => auditResult(),
  });
  const control = JSON.parse(
    await readFile(path.join(input.stateDir, 'control.json'), 'utf8')
  );
  assert.equal(receipt.schema, PILOT_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.audit.unmappedTrackedFileCount, 0);
  assert.equal(receipt.safety.incrementalModelSpendCents, 0);
  assert.equal(control.schema, PILOT_CONTROL_SCHEMA);
  assert.equal(control.status, 'active');
  assert.equal(isControlActive(control, input.policy, NOW), true);
  assert.equal(
    isControlActive(control, input.policy, '2026-09-02T12:05:00.000Z'),
    false
  );
  const attestation = await attestPilot(input);
  assert.equal(attestation.schema, PILOT_ATTESTATION_SCHEMA);
  assert.equal(attestation.source.sha, ENV.GITHUB_SHA);
  const closedControl = JSON.parse(
    await readFile(path.join(input.stateDir, 'control.json'), 'utf8')
  );
  assert.equal(closedControl.status, 'idle');
  assert.equal(closedControl.leaseExpiresAt, null);
});

test('the active lease exists before audit execution can crash', async () => {
  const input = await fixture();
  await runPilot({
    ...input,
    executeAudit: async () => {
      const control = JSON.parse(
        await readFile(path.join(input.stateDir, 'control.json'), 'utf8')
      );
      assert.equal(control.status, 'active');
      assert.equal(isControlActive(control, input.policy, NOW), true);
      return auditResult();
    },
  });
});

test('a bad audit receipt disables the pilot without retaining raw output', async () => {
  const input = await fixture();
  const receipt = await runPilot({
    ...input,
    executeAudit: async () => auditResult({ unmappedTrackedFileCount: 1 }),
  });
  const control = JSON.parse(
    await readFile(path.join(input.stateDir, 'control.json'), 'utf8')
  );
  assert.equal(receipt.status, 'disabled');
  assert.equal(receipt.reason, 'invalid-receipt');
  assert.equal(receipt.audit, null);
  assert.equal(control.status, 'disabled');
  assert.equal(control.automaticReenable, false);
});

test('a disabled pilot fails closed on later events instead of re-enabling', async () => {
  const input = await fixture();
  await disablePilot({ ...input, reason: 'runner-error' });
  let called = false;
  const receipt = await runPilot({
    ...input,
    executeAudit: async () => {
      called = true;
      return auditResult();
    },
  });
  assert.equal(called, false);
  assert.equal(receipt.status, 'disabled');
  assert.equal(receipt.reason, 'previously-disabled');
});

test('an expired in-flight lease disables the next event without auditing', async () => {
  const input = await fixture();
  await runPilot({ ...input, executeAudit: async () => auditResult() });
  let called = false;
  const receipt = await runPilot({
    ...input,
    env: { ...ENV, GITHUB_RUN_ID: '124', GITHUB_RUN_ATTEMPT: '1' },
    now: () => '2026-09-02T12:05:00.000Z',
    executeAudit: async () => {
      called = true;
      return auditResult();
    },
  });
  const control = JSON.parse(
    await readFile(path.join(input.stateDir, 'control.json'), 'utf8')
  );
  assert.equal(called, false);
  assert.equal(receipt.status, 'disabled');
  assert.equal(receipt.reason, 'runner-error');
  assert.equal(control.status, 'disabled');
  assert.equal(control.leaseExpiresAt, null);
});

test('a live abandoned lease also disables its successor without auditing', async () => {
  const input = await fixture();
  await runPilot({ ...input, executeAudit: async () => auditResult() });
  let called = false;
  const receipt = await runPilot({
    ...input,
    env: { ...ENV, GITHUB_RUN_ID: '124', GITHUB_RUN_ATTEMPT: '1' },
    now: () => '2026-09-02T12:01:00.000Z',
    executeAudit: async () => {
      called = true;
      return auditResult();
    },
  });
  assert.equal(called, false);
  assert.equal(receipt.status, 'disabled');
  assert.equal(receipt.reason, 'runner-error');
});

test('an execution failure disables the pilot as audit-failed', async () => {
  const input = await fixture();
  const receipt = await runPilot({
    ...input,
    executeAudit: async () => {
      throw new Error('fixture execution failure');
    },
  });
  assert.equal(receipt.status, 'disabled');
  assert.equal(receipt.reason, 'audit-failed');
});

test('a malformed or stale host control disables instead of re-enabling', async () => {
  const input = await fixture();
  await writeFile(
    path.join(input.stateDir, 'control.json'),
    JSON.stringify({ schema: PILOT_CONTROL_SCHEMA, status: 'active' })
  );
  let called = false;
  const receipt = await runPilot({
    ...input,
    executeAudit: async () => {
      called = true;
      return auditResult();
    },
  });
  assert.equal(called, false);
  assert.equal(receipt.status, 'disabled');
  assert.equal(receipt.reason, 'invalid-receipt');
});

test('unexpected host, trigger, spend, egress, and notification changes fail closed', async () => {
  for (const mutate of [
    value => (value.host = 'other'),
    value => (value.stateDirectory = '/tmp/other'),
    value => (value.trigger.cadence = 'hourly'),
    value => (value.limits.incrementalModelSpendCents = 1),
    value => (value.dataBoundary.externalCodeEgressAllowed = true),
    value => (value.notification.channel = 'slack'),
    value => (value.rollback.automaticReenable = true),
  ]) {
    const candidate = await policy();
    mutate(candidate);
    assert.throws(() => validateActivationPolicy(candidate));
  }
});

test('source identity rejects PR, manual, non-main, and malformed runs', async () => {
  for (const env of [
    { ...ENV, GITHUB_EVENT_NAME: 'pull_request' },
    { ...ENV, GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { ...ENV, GITHUB_REF: 'refs/heads/feature' },
    { ...ENV, GITHUB_SHA: 'short' },
    {
      ...ENV,
      GITHUB_CURRENT_MAIN_SHA: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    { ...ENV, GITHUB_RUN_ID: '0' },
  ]) {
    const input = await fixture();
    await assert.rejects(
      runPilot({ ...input, env, executeAudit: async () => auditResult() })
    );
  }
});

test('an older queued run cannot overwrite newer host state', async () => {
  const input = await fixture();
  const newer = {
    ...input,
    env: { ...ENV, GITHUB_RUN_ID: '124', GITHUB_RUN_ATTEMPT: '1' },
  };
  await runPilot({ ...newer, executeAudit: async () => auditResult() });
  await assert.rejects(
    runPilot({ ...input, executeAudit: async () => auditResult() }),
    /older than host control/
  );
  const control = JSON.parse(
    await readFile(path.join(input.stateDir, 'control.json'), 'utf8')
  );
  assert.equal(control.source.runId, '124');
});

test('attestation rejects altered artifact receipts and expired leases', async () => {
  const input = await fixture();
  await runPilot({ ...input, executeAudit: async () => auditResult() });
  const receipt = JSON.parse(await readFile(input.receiptFile, 'utf8'));
  receipt.policyDigest = 'tampered';
  await writeFile(input.receiptFile, JSON.stringify(receipt));
  await assert.rejects(attestPilot(input), /policy digest is stale/);

  const expiredInput = await fixture();
  await runPilot({ ...expiredInput, executeAudit: async () => auditResult() });
  await assert.rejects(
    attestPilot({
      ...expiredInput,
      now: () => '2026-09-02T12:05:00.000Z',
    }),
    /lease is not active/
  );
});

test('CI activates the pilot only on trusted main without gating production', async () => {
  const workflow = await readFile(
    path.join(repoRoot, '.github/workflows/ci.yml'),
    'utf8'
  );
  const start = workflow.indexOf('  continuous-audit-pilot:');
  const end = workflow.indexOf('\n  main-release-ready:', start);
  assert.ok(start >= 0 && end > start);
  const job = workflow.slice(start, end);
  assert.match(
    job,
    /if: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' \}\}/
  );
  assert.match(job, /runs-on: \[self-hosted, Linux, X64, jovie-fixed\]/);
  assert.match(job, /timeout-minutes: 3/);
  assert.match(job, /continue-on-error: true/);
  assert.match(job, /group: continuous-audit-pilot-gem/);
  assert.match(job, /retention-days: 3/);
  assert.match(job, /name: Confirm exact current main/);
  assert.match(job, /name: Attest preserved host receipt/);
  assert.match(job, /steps\.preserve-receipt\.outcome == 'success'/);
  assert.match(job, /steps\.continuous-audit\.outcome != 'success'/);
  assert.match(job, /steps\.preserve-receipt\.outcome != 'success'/);
  assert.match(
    job,
    /steps\.continuous-audit-attestation\.outcome != 'success'/
  );
  assert.match(job, /id: continuous-audit-disable/);
  assert.ok(
    job.indexOf('name: Disable pilot after a terminal failure') >
      job.indexOf('name: Attest preserved host receipt')
  );
  assert.doesNotMatch(job, /secrets\./);
  assert.doesNotMatch(job, /schedule:|workflow_dispatch:|pull_request:/);
});
