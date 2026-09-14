import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalizeDeliveryEvent } from '../../scripts/backlog-orchestrator/delivery-state-machine.mjs';

const workflow = readFileSync(
  fileURLToPath(
    new URL('../workflows/production-continuity.yml', import.meta.url)
  ),
  'utf8'
);

it('keeps the external guard bounded, ordered, deduplicated, and credential-free', () => {
  for (const required of [
    /cron: '\*\/5 \* \* \* \*'/,
    /production-continuity\.mjs/,
    /cancel-in-progress: false/,
    /Slack acknowledged the production incident alert/,
    /failure: "provider-unavailable"/,
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
