import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEPENDABOT_ALERT_DISPATCH_TYPE,
  dependabotAlertDispatchBody,
  planDependabotAlertWake,
} from './lib/security-advisory-event-wake.mjs';

test('created/reopened/reintroduced Dependabot alerts wake intake', () => {
  for (const action of ['created', 'reopened', 'reintroduced']) {
    const plan = planDependabotAlertWake({
      action,
      alert: {
        number: 42,
        html_url: 'https://github.com/JovieInc/Jovie/security/dependabot/42',
        security_advisory: { ghsa_id: 'GHSA-xxxx-yyyy-zzzz', severity: 'high' },
        dependency: { package: { name: 'left-pad', ecosystem: 'npm' } },
      },
    });
    assert.equal(plan.wake, true);
    assert.equal(plan.clientPayload.alert_number, 42);
    assert.equal(plan.clientPayload.ghsa_id, 'GHSA-xxxx-yyyy-zzzz');
    assert.equal(plan.clientPayload.action, action);
    assert.deepEqual(
      dependabotAlertDispatchBody(plan.clientPayload).event_type,
      DEPENDABOT_ALERT_DISPATCH_TYPE
    );
  }
});

test('fixed/dismissed alerts do not wake (clock/push still close)', () => {
  for (const action of ['fixed', 'dismissed', 'auto_dismissed', '']) {
    const plan = planDependabotAlertWake({
      action,
      alert: { number: 1, security_advisory: { ghsa_id: 'GHSA-a' } },
    });
    assert.equal(plan.wake, false);
    assert.match(plan.reason, /ignored_action|missing/);
  }
});

test('missing alert number fails closed without a wake', () => {
  const plan = planDependabotAlertWake({
    action: 'created',
    alert: { security_advisory: { ghsa_id: 'GHSA-a' } },
  });
  assert.equal(plan.wake, false);
  assert.equal(plan.reason, 'missing_alert_number');
});
