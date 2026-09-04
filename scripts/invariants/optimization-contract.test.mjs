import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildPlanGateReceipt } from '../backlog-orchestrator/plan-gate.mjs';
import {
  CONTROL_PLANE_OPTIMIZATION_EXCEPTION,
  completeProductOptimizationContract,
  resolveOptimizationContract,
  SPAWNED_OPTIMIZATION_CONTRACT_INSTRUCTION,
  validateOptimizationContract,
} from './optimization-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function issue(overrides = {}) {
  return {
    id: 'issue-id',
    identifier: 'JOV-900',
    title: 'Bounded fix',
    state: { name: 'Triage', type: 'triage' },
    assignee: null,
    labels: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    verified: true,
    concrete: true,
    bounded: true,
    repo: 'JovieInc/Jovie',
    project: 'Jovie',
    owners: { implementation: 'Symphony', verification: 'Gem' },
    scope: 'Change one control-plane module and its focused tests',
    acceptance: ['The approved receipt is written exactly once'],
    test: ['node --test scripts/invariants/optimization-contract.test.mjs'],
    rollback: 'Revert the plan-gate commit and remove the receipt comment',
    optimization: CONTROL_PLANE_OPTIMIZATION_EXCEPTION,
    ...overrides,
  };
}

describe('JOV-INV-012 optimization contract', () => {
  it('states continuous-optimization doctrine in product canon', () => {
    const canon = readFileSync(resolve(ROOT, 'canon/PRODUCT.md'), 'utf8');
    assert.match(canon, /## Continuous Optimization/);
    assert.match(canon, /Learning hierarchy/);
    assert.match(canon, /broader evidence is a prior only/i);
    assert.match(canon, /Artist business outcome/);
    assert.match(canon, /Durable fan value/);
    assert.match(canon, /ZZ Top/);
    assert.match(canon, /JOV-INV-012/);
  });
  it('rejects a missing optimization contract', () => {
    assert.equal(
      validateOptimizationContract(undefined),
      'optimization-contract-missing'
    );
    assert.equal(
      validateOptimizationContract(null),
      'optimization-contract-missing'
    );
    assert.equal(
      validateOptimizationContract({}),
      'optimization-contract-missing'
    );
    assert.equal(
      validateOptimizationContract({ kind: 'product' }),
      'optimization-contract-incomplete:variantIdentity'
    );
  });

  it('accepts a complete product optimization contract', () => {
    assert.equal(
      validateOptimizationContract(completeProductOptimizationContract()),
      null
    );
  });

  it('accepts a justified non-product exception', () => {
    assert.equal(
      validateOptimizationContract(CONTROL_PLANE_OPTIMIZATION_EXCEPTION),
      null
    );
    assert.equal(
      validateOptimizationContract({
        kind: 'exception',
        class: 'non-optimizable',
        justification:
          'Docs-only change with no user-facing page, link, asset, campaign, recommendation, or content variant.',
      }),
      null
    );
  });

  it('rejects an intermediate-only primary metric and a parallel analytics stack', () => {
    assert.equal(
      validateOptimizationContract(
        completeProductOptimizationContract({ primaryMetric: 'engagement' })
      ),
      'optimization-contract-intermediate-objective'
    );
    assert.equal(
      validateOptimizationContract(
        completeProductOptimizationContract({
          exposure: 'custom warehouse',
          outcome: 'custom warehouse',
          attribution: 'custom warehouse',
          decisionWriteback: 'custom warehouse',
        })
      ),
      'optimization-contract-parallel-stack'
    );
  });

  it('preserves an optimization contract in the plan-gate receipt', () => {
    const product = completeProductOptimizationContract();
    const receipt = buildPlanGateReceipt(
      issue(),
      evidence({ optimization: product })
    );
    const payload = JSON.parse(receipt.split('\n')[1]);
    assert.equal(payload.schema, 'plan-gate/v1');
    assert.deepEqual(payload.evidence.optimization, product);
    assert.equal(
      validateOptimizationContract(payload.evidence.optimization),
      null
    );

    const exempted = buildPlanGateReceipt(issue(), evidence());
    const exemptedPayload = JSON.parse(exempted.split('\n')[1]);
    assert.deepEqual(
      exemptedPayload.evidence.optimization,
      CONTROL_PLANE_OPTIMIZATION_EXCEPTION
    );
  });

  it('instructs spawned agents to satisfy or explicitly exempt the optimization contract', () => {
    const grokShip = readFileSync(
      resolve(ROOT, 'scripts/symphony/grok-ship-one'),
      'utf8'
    );
    const shipper = readFileSync(
      resolve(ROOT, 'scripts/symphony/lib/codex-issue-shipper.ts'),
      'utf8'
    );
    const compact = text => text.replace(/\s+/g, ' ');
    assert.match(grokShip, /JOV-INV-012/);
    assert.match(shipper, /JOV-INV-012/);
    assert.equal(
      compact(grokShip).includes(SPAWNED_OPTIMIZATION_CONTRACT_INSTRUCTION),
      true
    );
    assert.equal(
      compact(shipper).includes(SPAWNED_OPTIMIZATION_CONTRACT_INSTRUCTION),
      true
    );
    assert.match(
      SPAWNED_OPTIMIZATION_CONTRACT_INSTRUCTION,
      /explicitly declare a justified exception/
    );
  });

  it('resolves an explicit product contract or exception and rejects omission', () => {
    const productIssue = issue({
      description: `## Optimization contract
\`\`\`json
${JSON.stringify(completeProductOptimizationContract())}
\`\`\`
`,
    });
    assert.equal(
      validateOptimizationContract(resolveOptimizationContract(productIssue)),
      null
    );
    assert.equal(
      resolveOptimizationContract(productIssue).variantIdentity,
      'smart-link-cta:primary:v3'
    );

    const exceptionIssue = issue({
      identifier: 'JOV-4045',
      description: `## Optimization exception
- Class: non-optimizable
- Justification: This change is the optimization invariant itself and ships no user-facing variant.
`,
    });
    const resolved = resolveOptimizationContract(exceptionIssue);
    assert.equal(resolved.kind, 'exception');
    assert.equal(resolved.class, 'non-optimizable');
    assert.equal(validateOptimizationContract(resolved), null);

    const missing = resolveOptimizationContract(
      issue({
        identifier: 'JOV-1',
        description: '## Proposed fix\nTouch plan-gate.',
      })
    );
    assert.equal(missing, null);
    assert.equal(
      validateOptimizationContract(missing),
      'optimization-contract-missing'
    );
  });
});
