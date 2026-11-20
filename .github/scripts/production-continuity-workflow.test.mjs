import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

import { normalizeDeliveryEvent } from '../../scripts/backlog-orchestrator/delivery-state-machine.mjs';

const workflow = readFileSync(
  fileURLToPath(
    new URL('../workflows/production-continuity.yml', import.meta.url)
  ),
  'utf8'
);

function assertRuntimePinned(source) {
  const { jobs } = load(source);
  for (const name of ['observe', 'remediation']) {
    const { steps } = jobs[name];
    const checkout = steps.findIndex(step =>
      step.uses?.startsWith('actions/checkout@')
    );
    const prime = steps.findIndex(
      step => step.uses === './.github/actions/prime-node-toolcache'
    );
    const setup = steps.findIndex(
      step =>
        step.uses?.startsWith('actions/setup-node@') &&
        step.with?.['node-version-file'] === '.nvmrc'
    );
    const firstNode = steps.findIndex(step => /\bnode\s/.test(step.run ?? ''));
    assert.ok(
      checkout >= 0 && checkout < prime && prime < setup && setup < firstNode,
      `${name} must prime and select pinned Node before executing policy code`
    );
  }
}

it('selects the TypeScript-capable repository Node before both continuity entrypoints', () => {
  assertRuntimePinned(workflow);
});

it('rejects missing, late or unprimed Node setup in either workflow job', () => {
  for (const name of ['observe', 'remediation']) {
    for (const mutation of ['missing', 'late', 'unprimed']) {
      const policy = load(workflow);
      const steps = policy.jobs[name].steps;
      const index = steps.findIndex(step =>
        step.uses?.startsWith('actions/setup-node@')
      );
      if (mutation === 'missing') steps.splice(index, 1);
      if (mutation === 'late') steps.push(...steps.splice(index, 1));
      if (mutation === 'unprimed')
        steps.splice(
          steps.findIndex(
            step => step.uses === './.github/actions/prime-node-toolcache'
          ),
          1
        );
      assert.throws(
        () => assertRuntimePinned(JSON.stringify(policy)),
        new RegExp(name)
      );
    }
  }
});

it('loads the real remediation entrypoint with the selected repository runtime', () => {
  const child = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('./production-continuity.mjs', import.meta.url)),
      '--remediation-conclusion',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        OBSERVE_RESULT: 'success',
        OBSERVE_STATUS: 'healthy',
      },
      timeout: 10_000,
    }
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), 'success');
});

it('keeps the external guard bounded, ordered, deduplicated, and credential-free', () => {
  for (const required of [
    /cron: '\*\/5 \* \* \* \*'/,
    /production-continuity\.mjs/,
    /cancel-in-progress: false/,
    /Slack acknowledged the production incident alert/,
    /failure: \$failure/,
    /INGRESS_FAILURE:-provider-unavailable/,
    /agent_ingress_failure/,
    /delivery-state-machine\.mjs/,
    /productionMutation: "none"/,
    /Deduplicate acknowledged alert transport/,
    /production-continuity-dedupe\.mjs/,
    /steps\.dedupe\.outputs\.should_notify == 'true'/,
    /production-continuity-checkin\.mjs/,
    /--status=in_progress/,
    /steps\.probe\.outcome == 'success'/,
    /steps\.observation_receipt\.outcome == 'success'/,
    /steps\.observation_summary\.outcome == 'success'/,
    /--check-in-id="\$CHECK_IN_ID"/,
    /secrets\.SENTRY_DSN/,
    /contents: read/,
  ])
    assert.match(workflow, required);
  assert.ok(
    workflow.indexOf('founder-alert:') < workflow.indexOf('preserve-incident:')
  );
  assert.ok(
    workflow.indexOf('agent-ingress:') < workflow.indexOf('preserve-incident:')
  );
  assert.doesNotMatch(workflow, /VERCEL_TOKEN|\/pause|\/resume|Spend Amount/);
  assert.doesNotMatch(workflow, /SENTRY_AUTH_TOKEN/);
  assert.doesNotMatch(workflow, /budgetAmountUsd|approvedEmergencyCeilingUsd/);
  assert.doesNotMatch(workflow, /contents: write|actions: write/);
});

it('uses an event accepted by the real provider-recovery ingress', () => {
  const event = normalizeDeliveryEvent({
    client_payload: {
      delivery_key: 'production-continuity:summer-production:deployment-paused',
      repository: 'JovieInc/Jovie',
      source: 'production-continuity-guard',
      event: 'production-continuity-unavailable',
      failure: 'provider-unavailable',
      evidence: {
        affectedTargets: ['summer-production'],
        incidentClasses: ['deployment-paused'],
        productionMutation: 'none',
      },
    },
  });
  assert.equal(event.failure, 'provider-unavailable');
  assert.equal(
    event.deliveryKey,
    'production-continuity:summer-production:deployment-paused'
  );
  assert.deepEqual(event.evidence.affectedTargets, ['summer-production']);
  assert.equal(event.evidence.productionMutation, 'none');
});

it('routes provider classes as provider-unavailable and stale production as production-controller-failed', async () => {
  const { readFileSync: read } = await import('node:fs');
  const probe = read(
    fileURLToPath(new URL('./production-continuity.mjs', import.meta.url)),
    'utf8'
  );
  assert.match(probe, /'provider-unavailable'/);
  assert.match(probe, /'production-controller-failed'/);
});
