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
