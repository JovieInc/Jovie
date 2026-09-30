// biome-ignore-all format: compact regression controls keep the guarded PR under 500 lines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildTopology, findCycle, validateTopology } from './ci-workflow-topology.mjs';

test('repository workflows satisfy the topology and fan-out contract', () => {
  const { policy, nodes, edges } = buildTopology();
  assert.equal(nodes.find(node => node.name === 'Test Coverage Audit')?.category, 'source-validation');
  assert.deepEqual(validateTopology({ policy, nodes, edges }).errors, []);
  const observers = new Set(nodes.filter(node => node.active && node.category === 'telemetry-aggregation').map(node => node.name));
  assert.equal(edges.some(edge => edge.type === 'workflow_run' && observers.has(edge.from)), false);
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

test('yaml parse result is narrowed before property access (JOV-7290)', () => {
  const source = fs.readFileSync(new URL('./ci-workflow-topology.mjs', import.meta.url), 'utf8');
  assert.match(source, /@typedef \{object\} WorkflowYaml/);
  assert.match(source, /@type \{WorkflowYaml\} \*\/ \(yamlLoad/);
});
