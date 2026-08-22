import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY_GATES,
  validatePolicyGates,
} from '../policy-gate-liveness.mjs';

const copyPolicy = () => structuredClone(DEFAULT_POLICY_GATES);

describe('bootstrap-safe policy gates', () => {
  it('accepts the repository policy', () => {
    expect(validatePolicyGates()).toEqual({ ok: true, errors: [] });
  });

  it('deliberate red: rejects CI evidence before draft creation', () => {
    const policy = copyPolicy();
    policy.gates.find(gate => gate.id === 'hook-policy').requires = [
      'exact-head-ci',
    ];
    expect(validatePolicyGates(policy).errors).toContain(
      'hook-policy: exact-head-ci is not available before draft-publication'
    );
  });

  it('deliberate red: rejects an advisory recommendation made blocking', () => {
    const policy = copyPolicy();
    policy.gates.find(gate => gate.id === 'branch-recommendation').mode =
      'blocking';
    expect(validatePolicyGates(policy).errors).toContain(
      'branch-recommendation: blocker is not allowlisted for draft-publication'
    );
  });

  it('deliberate red: rejects a direct A to B to A cycle', () => {
    const policy = copyPolicy();
    policy.gates.push(
      {
        id: 'A',
        transition: 'fast-ci',
        mode: 'advisory',
        requires: ['github-pr-metadata'],
        dependsOn: ['B'],
      },
      {
        id: 'B',
        transition: 'remediation',
        mode: 'advisory',
        requires: ['exact-head-ci'],
        dependsOn: ['A'],
      }
    );
    expect(validatePolicyGates(policy).errors).toContain(
      'policy cycle detected at A'
    );
  });
});
