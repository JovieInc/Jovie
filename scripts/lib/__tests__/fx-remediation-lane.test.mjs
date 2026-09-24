import { describe, expect, it } from 'vitest';
import {
  FX_EXECUTOR_POLICY,
  validateFxExecutorIdentity,
} from '../fx-remediation-lane.mjs';

const validExecutor = {
  ...FX_EXECUTOR_POLICY,
  observedModel: FX_EXECUTOR_POLICY.expectedModel,
  stepsUsed: 12,
};

describe('FX remediation lane executor identity', () => {
  it('accepts the pinned FX CLI and configured gateway with observed model identity', () => {
    expect(validateFxExecutorIdentity(validExecutor)).toBe(true);
  });

  it('requires an observed step count within the configured cap', () => {
    expect(validateFxExecutorIdentity(validExecutor)).toBe(true);
    const { stepsUsed: _stepsUsed, ...missingSteps } = validExecutor;
    expect(validateFxExecutorIdentity(missingSteps)).toBe(false);
    expect(
      validateFxExecutorIdentity({ ...validExecutor, stepsUsed: 12 })
    ).toBe(true);
    expect(
      validateFxExecutorIdentity({ ...validExecutor, stepsUsed: 13 })
    ).toBe(false);
  });

  it.each([
    ['executor kind', { kind: 'cursor-cli' }],
    ['CLI version', { version: '0.0.8' }],
    ['archive pin', { archiveSha256: 'f'.repeat(64) }],
    ['provider', { provider: 'openai' }],
    ['execution route', { route: 'cursor-cloud' }],
    ['identity basis', { identityBasis: 'provider-attested' }],
    ['expected model', { expectedModel: 'openai/gpt-5.6-sol' }],
    ['observed model', { observedModel: 'openai/gpt-5.6-sol' }],
    ['model substitution policy', { modelSubstitutionPolicy: 'allow' }],
    ['step cap', { maxSteps: 13 }],
    ['step cap source', { stepLimitBasis: 'unbounded' }],
  ])('rejects a changed %s', (_label, override) => {
    expect(validateFxExecutorIdentity({ ...validExecutor, ...override })).toBe(
      false
    );
  });

  it('rejects missing, malformed, and untrusted identity records', () => {
    expect(validateFxExecutorIdentity(null)).toBe(false);
    expect(validateFxExecutorIdentity('fx-cli')).toBe(false);
    expect(
      validateFxExecutorIdentity({
        ...validExecutor,
        archiveSha256:
          'C5787EA041D3B5521EC675F1ADA78F30CF1B11021FFCAC48B4969CF5BEB65C45',
      })
    ).toBe(false);
    expect(
      validateFxExecutorIdentity({ ...validExecutor, stepsUsed: -1 })
    ).toBe(false);
    expect(
      validateFxExecutorIdentity({ ...validExecutor, stepsUsed: 0.5 })
    ).toBe(false);
  });
});
