import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadComputerUseDecision,
  validateComputerUseDecision,
} from './computer-use-decision.mjs';

function receipt() {
  return structuredClone(loadComputerUseDecision());
}

test('JOV-7340 decision receipt validates with an ordered contract replay', () => {
  const value = receipt();
  assert.deepEqual(validateComputerUseDecision(value), []);
  assert.equal(value.productionPromotion.allowed, false);
  assert.equal(value.replay.providerRuntimeExecuted, false);
});

test('Jovie control layers cannot be delegated to the managed provider', () => {
  const value = receipt();
  value.slices.find(
    slice => slice.capability === 'approval-boundary'
  ).disposition = 'ADOPT';
  assert.ok(
    validateComputerUseDecision(value).some(error =>
      error.includes('approval-boundary cannot be delegated')
    )
  );
});

test('inventory maps every material open issue to capability slices', () => {
  const value = receipt();
  value.affectedWork = value.affectedWork.filter(
    work => work.issue !== 'JOV-6227'
  );
  value.slices = value.slices.filter(
    slice => slice.capability !== 'browser-session-hosting'
  );
  const errors = validateComputerUseDecision(value);
  assert.ok(errors.includes('missing open issue JOV-6227'));
  assert.ok(
    errors.includes('missing capability slice browser-session-hosting')
  );
});

test('replay fails closed when approval or the independent oracle is bypassed', () => {
  const withoutApproval = receipt();
  withoutApproval.replay.steps = withoutApproval.replay.steps.filter(
    step => step !== 'origin-approved'
  );
  assert.ok(
    validateComputerUseDecision(withoutApproval).some(error =>
      error.includes('origin-approved')
    )
  );

  const selfCertified = receipt();
  selfCertified.replay.steps = selfCertified.replay.steps.filter(
    step => step !== 'independent-oracle-passed'
  );
  assert.ok(
    validateComputerUseDecision(selfCertified).some(error =>
      error.includes('independent-oracle-passed')
    )
  );
});

test('contract replay cannot claim a live run or production authority', () => {
  const value = receipt();
  value.replay.providerRuntimeExecuted = true;
  value.productionPromotion.allowed = true;
  const errors = validateComputerUseDecision(value);
  assert.ok(errors.some(error => error.includes('live provider run')));
  assert.ok(errors.some(error => error.includes('production promotion')));
});

test('retained Jovie controls cannot be delegated or disowned', () => {
  for (const capability of ['retries-recovery', 'product-specific-behavior']) {
    const delegated = receipt();
    const slice = delegated.slices.find(
      entry => entry.capability === capability
    );
    slice.jovieOwned = false;
    slice.disposition = 'ADOPT';
    const errors = validateComputerUseDecision(delegated);
    assert.ok(
      errors.some(error =>
        error.includes(`${capability} must remain Jovie-owned`)
      )
    );
    assert.ok(
      errors.some(error => error.includes(`${capability} cannot be delegated`))
    );
  }
});

test('placeholder sources fail validation', () => {
  const value = receipt();
  value.sources[0] = { url: '', evidence: 'TODO' };
  value.sources[1] = { url: 'not-a-url', evidence: 'see docs' };
  const errors = validateComputerUseDecision(value);
  assert.ok(errors.some(error => error.includes('material https source')));
  assert.ok(errors.some(error => error.includes('material evidence')));
});

test('work entries cannot map to bogus capabilities or lack evidence', () => {
  const value = receipt();
  value.affectedWork[0].capabilities = ['invented-capability'];
  value.affectedWork[0].evidence = '';
  const errors = validateComputerUseDecision(value);
  assert.ok(
    errors.some(error =>
      error.includes('unknown capability invented-capability')
    )
  );
  assert.ok(errors.some(error => error.includes('material evidence')));
});

test('slices cannot introduce unknown capabilities or empty reasons', () => {
  const value = receipt();
  value.slices.push({ capability: 'uncontrolled-slice', disposition: 'KEEP' });
  const errors = validateComputerUseDecision(value);
  assert.ok(errors.some(error => error.includes('unknown capability slice')));
  assert.ok(
    errors.some(error =>
      error.includes('uncontrolled-slice must record a reason')
    )
  );
});

test('replay fails closed on empty or unapproved origins and empty oracle', () => {
  const emptyOrigins = receipt();
  emptyOrigins.replay.approvedOrigins = [];
  assert.ok(
    validateComputerUseDecision(emptyOrigins).some(error =>
      error.includes('approved origins')
    )
  );

  const hostile = receipt();
  hostile.replay.approvedOrigins = ['http://evil.example', ''];
  hostile.replay.oracle = '';
  const errors = validateComputerUseDecision(hostile);
  assert.ok(
    errors.filter(error => error.includes('not an approved https origin'))
      .length === 2
  );
  assert.ok(errors.some(error => error.includes('independent oracle')));
});

test('production promotion requires material requirements', () => {
  const empty = receipt();
  empty.productionPromotion.requirements = [];
  assert.ok(
    validateComputerUseDecision(empty).some(error =>
      error.includes('promotion requirements')
    )
  );

  const hollow = receipt();
  hollow.productionPromotion.requirements = ['ok'];
  assert.ok(
    validateComputerUseDecision(hollow).some(error =>
      error.includes('must be material')
    )
  );
});
