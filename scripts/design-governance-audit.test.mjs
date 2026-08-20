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
