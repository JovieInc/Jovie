import { describe, expect, it } from 'vitest';
import type { DecisionJob } from '../agent/lib/governor-route';
import { RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS } from '../agent/lib/summer-gem-dark-recovery';
import { dispatchSummerGovernedRequest } from '../agent/lib/summer-governed-dispatch';

function decisionJob(overrides: Partial<DecisionJob> = {}): DecisionJob {
  return {
    kind: 'decision',
    id: 'gov-dispatch-1',
    jobClass: 'ambiguous-product-reasoning',
    riskTier: 'medium',
    objective: 'Admit allowlisted repair work under JOV-6163',
    requiredCapabilities: ['reasoning', 'product'],
    certificationPredicate: 'source-bound-signed-rate-limited',
    authority: 'automation',
    evidenceRefs: ['jov-6163'],
    ...overrides,
  };
}

function freshReceipt(nowMs: number) {
  return {
    schema: 'gem-service-attestation/v1',
    sourceRevision: 'c'.repeat(40),
    observedAt: new Date(nowMs - 30_000).toISOString(),
    active: true,
    healthy: true,
    listener: { port: 4041, boundToService: true },
  };
}

describe('Summer governed dispatch (request outcome → router launches)', () => {
  const nowMs = Date.parse('2026-09-12T17:00:00.000Z');

  it('routes to Symphony when attestation is fresh', () => {
    const result = dispatchSummerGovernedRequest({
      decisionJob: decisionJob(),
      attestationReceipt: freshReceipt(nowMs),
      nowMs,
    });
    expect(result.outcome).toBe('symphony-route');
    if (result.outcome !== 'symphony-route') return;
    expect(result.trigger).toMatchObject({
      dark: false,
      reason: 'attestation-fresh',
    });
    expect(result.route.selectedRoute.id).toBeTruthy();
  });

  it('requests Cursor recovery (not Gem) when attestation is unavailable', () => {
    const stale = {
      ...freshReceipt(nowMs),
      observedAt: new Date(
        nowMs - RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS - 1
      ).toISOString(),
    };
    const result = dispatchSummerGovernedRequest({
      decisionJob: decisionJob(),
      attestationReceipt: stale,
      nowMs,
    });
    expect(result.outcome).toBe('cursor-recovery-request');
    if (result.outcome !== 'cursor-recovery-request') return;
    expect(result.trigger.reason).toBe('runner-source-attestation-unavailable');
    expect(result.route.selectedRoute.tuple.provider).toBe('cursor-cloud');
    expect(result.route.selectedRoute.tuple.provider).not.toBe('gem');
    expect(result.route.selectedRoute.tuple.provider).not.toBe('symphony');
    expect(result.recoveryJobId).toContain('cursor-recovery:');
  });

  it('holds without Cursor spend when no attestation probe is configured', () => {
    const result = dispatchSummerGovernedRequest({
      decisionJob: decisionJob(),
      nowMs,
    });
    expect(result.outcome).toBe('hold');
    if (result.outcome !== 'hold') return;
    expect(result.trigger.reason).toBe('unknown-fail-closed');
    expect(result.remainingHumanDecision).toMatch(
      /Configure SUMMER_RUNNER_SOURCE_ATTESTATION|SUMMER_GEM_DARK/i
    );
  });

  it('explicit SUMMER_GEM_DARK forces Cursor recovery request', () => {
    const result = dispatchSummerGovernedRequest({
      decisionJob: decisionJob(),
      environment: { SUMMER_GEM_DARK: 'dark' },
      attestationReceipt: freshReceipt(nowMs),
      nowMs,
    });
    expect(result.outcome).toBe('cursor-recovery-request');
    if (result.outcome !== 'cursor-recovery-request') return;
    expect(result.route.selectedRoute.tuple.provider).toBe('cursor-cloud');
  });
});
