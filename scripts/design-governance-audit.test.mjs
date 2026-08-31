import assert from 'node:assert/strict';
import test from 'node:test';
import { runDesignGovernanceAudit } from './design-governance-audit.mjs';

test('repo design governance audit has no FAIL checks', () => {
  const { failed, results } = runDesignGovernanceAudit();
  assert.ok(results.length > 0, 'audit must report at least one check');
  assert.deepEqual(
    failed,
    [],
    failed.map(item => `${item.id}: ${item.detail}`).join('\n')
  );
});

test('audit requires the standing enforcement commands', () => {
  const { results } = runDesignGovernanceAudit();
  const wiring = results.find(item => item.id === 'enforcement-wiring');
  assert.equal(wiring?.status, 'WARN');
  assert.match(wiring.detail, /design:governance:audit/);
  assert.match(wiring.detail, /design:tokens:export:check/);
  assert.match(wiring.detail, /not a ci-fast merge gate/);
  const scripts = results.find(item => item.id === 'package-scripts');
  assert.equal(scripts?.status, 'PASS');
});

test('audits the design-system authority map from governance', () => {
  const { results } = runDesignGovernanceAudit();
  const authority = results.find(
    item => item.id === 'design-system-authority-map'
  );
  assert.equal(authority?.status, 'PASS');
  assert.match(authority.detail, /systemAuthorityMap\.json/);
  assert.match(authority.detail, /dependency order/);
  assert.match(authority.detail, /canonical owners/);
  assert.match(authority.detail, /status floors/);
});

test('binds design projections to the canonical invariant registry', () => {
  const { results } = runDesignGovernanceAudit();
  const projection = results.find(
    item => item.id === 'design-invariant-projection'
  );
  assert.equal(projection?.status, 'PASS');
  assert.match(projection.detail, /JOV-INV-019/);
  assert.match(projection.detail, /executable generator and guard bindings/);
  const audit = results.find(item => item.id === 'shared-ui-visual-arbitrary');
  assert.equal(audit?.status, 'PASS');
  assert.match(audit.detail, /visual findings/);
  const outcome = results.find(item => item.id === 'shadcn-outcome-inventory');
  assert.equal(outcome?.status, 'PASS');
  assert.match(outcome.detail, /MIT public-outcome boundary/);
  const wiring = results.find(
    item => item.id === 'shared-ui-visual-arbitrary-wiring'
  );
  assert.equal(wiring?.status, 'PASS');
  assert.match(wiring.detail, /design:shared-ui-visual-arbitrary:check/);
});
