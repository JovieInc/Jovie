// biome-ignore-all format: compact regression controls keep the guarded PR under 500 lines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildTopology, findCycle, validateTopology } from './ci-workflow-topology.mjs';

test('repository workflows satisfy the topology and fan-out contract', () => {
  const { policy, nodes, edges } = buildTopology();
  assert.equal(nodes.find(node => node.name === 'Test Coverage Audit')?.category, 'source-validation');
  assert.deepEqual(validateTopology({ policy, nodes, edges }).errors, []);
  const observers = new Set(nodes.filter(node => node.active && node.category === 'telemetry-aggregation').map(node => node.name));
  assert.equal(edges.some(edge => edge.type === 'workflow_run' && observers.has(edge.from)), false);
  for (const producer of ['Source Validation', 'Fork PR Gate', 'PR Size Guard']) {
    assert.deepEqual(edges.filter(edge => edge.from === producer &&
      nodes.find(node => node.name === edge.to)?.category === 'remediation-dispatch'),
    [{ from: producer, to: 'Lane Fix Relay', type: 'workflow_run' }],
    `${producer} must deliver completion to the single repair owner`);
  }
});
test('rejects cycles, duplicate owners, and budget regressions', () => {
  assert.deepEqual(findCycle(['a', 'b'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]), ['a', 'b', 'a']);
  const topology = buildTopology();
  topology.policy.authoritativeOwners.push({ category: 'telemetry-aggregation', workflow: 'CI' });
  topology.policy.authoritySurfaces.push(topology.policy.authoritySurfaces[0]);
  topology.policy.budgets.normalPrCheckRecords = 1;
  topology.policy.budgets.mainShaWorkflowRuns = topology.policy.measuredBaseline.workflowRuns;
  const errors = validateTopology(topology).errors.join('\n');
  assert.match(errors, /exactly one authoritative owner/);
  assert.match(errors, /authority surfaces must have exactly one owner/);
  assert.match(errors, /normal PR check budget exceeded/);
  assert.match(errors, /did not fall by at least 75%/);
});

test('workflow yaml is parsed into name, triggers and job topology (JOV-7290)', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'topology-'));
  const dir = path.join(fixture, '.github/workflows');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'producer.yml'), 'name: Producer\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest\n');
  fs.writeFileSync(path.join(dir, 'consumer.yml'), 'name: Consumer\non:\n  workflow_run:\n    workflows: [Producer]\n    types: [completed]\njobs:\n  audit:\n    runs-on: ubuntu-latest\n  report:\n    runs-on: ubuntu-latest\n');
  const policy = {
    measuredBaseline: { workflowRuns: 4 },
    budgets: { blockingPrChecks: 1, normalPrCheckRecords: 10, normalPrExternalAllowance: 0, mainShaWorkflowRuns: 1 },
    authoritativeOwners: [{ category: 'source-validation', workflow: 'Producer' }],
    authoritySurfaces: [],
    blockingPrChecks: [],
    normalPrWorkflows: [],
    inactiveWorkflows: [],
  };
  const { nodes, edges } = buildTopology(fixture, policy);
  const consumer = nodes.find(node => node.name === 'Consumer');
  assert.equal(nodes.length, 2);
  assert.equal(consumer?.jobCount, 2);
  assert.equal(consumer?.terminalReceipt, 'job:report');
  assert.deepEqual(consumer?.triggeringStateTransition, ['workflow_run']);
  assert.deepEqual(edges, [{ from: 'Producer', to: 'Consumer', type: 'workflow_run' }]);
  fs.rmSync(fixture, { recursive: true, force: true });
});

test('release opportunity requires one staging completion path and rejects parallel CI or duplicate triggers', () => {
  for (const edge of [{ from: 'CI', to: 'Production Controller', type: 'workflow_run' }, { from: 'Staging Controller', to: 'Production Controller', type: 'workflow_run' }]) {
    const topology = buildTopology(); topology.edges.push(edge);
    assert.match(validateTopology(topology).errors.join('\n'), /exactly one Production Controller opportunity through completed staging/);
  }
  const topology = buildTopology(); topology.edges = topology.edges.filter(edge => edge.to !== 'Staging Controller');
  assert.match(validateTopology(topology).errors.join('\n'), /exactly one Production Controller opportunity through completed staging/);
});
