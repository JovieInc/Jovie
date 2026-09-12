/**
 * JOV-6163 interop proof: publisher-shaped attestation receipts must satisfy
 * Summer's runner-source evaluator with the same predicates the Symphony
 * concurrency controller uses (schema, revision, ≤600s, active/healthy,
 * listener 4041 boundToService). Does not weaken the 600s gate and does not
 * claim E1 (Gem install) is closed.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateRunnerSourceAttestation,
  resolveGemDarkTrigger,
  RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
} from '../agent/lib/summer-gem-dark-recovery';

/** Minimal receipt matching emit_gem_service_attestation.py output fields. */
function publisherShapedReceipt(nowMs: number, ageMs: number) {
  return {
    schema: 'gem-service-attestation/v1',
    observedAt: new Date(nowMs - ageMs).toISOString(),
    sourceRevision: 'd'.repeat(40),
    configurationSourceRevision: 'e'.repeat(40),
    service: 'symphony-elixir.service',
    active: true,
    daemonReloaded: true,
    healthy: true,
    listener: {
      port: 4041,
      pid: 456,
      wrapperPid: 123,
      controlGroup: '/user.slice/symphony-elixir.service',
      boundToService: true,
    },
    runtime: {
      workflowPath: '/opt/symphony/workflow',
      packageSha256: 'f'.repeat(64),
      executableSha256: 'a'.repeat(64),
      generation: '1',
      invocationId: 'inv-1',
      stateObservedAt: new Date(nowMs - ageMs).toISOString(),
      provenanceSha256: 'b'.repeat(64),
    },
    unitOverrides: [],
  };
}

describe('JOV-6163 publisher ↔ Summer attestation interop', () => {
  const nowMs = Date.parse('2026-09-12T18:00:00.000Z');

  it('accepts a publisher-shaped receipt within 600s (controller-equivalent)', () => {
    const receipt = publisherShapedReceipt(nowMs, 45_000);
    const probe = evaluateRunnerSourceAttestation(receipt, nowMs);
    expect(probe).toMatchObject({
      status: 'fresh',
      sourceRevision: 'd'.repeat(40),
    });
    const trigger = resolveGemDarkTrigger({
      attestationReceipt: receipt,
      nowMs,
    });
    expect(trigger).toMatchObject({ dark: false, reason: 'attestation-fresh' });
  });

  it('rejects publisher-shaped receipt older than 600s (gate not weakened)', () => {
    const receipt = publisherShapedReceipt(
      nowMs,
      RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS + 1
    );
    const probe = evaluateRunnerSourceAttestation(receipt, nowMs);
    expect(probe).toEqual({ status: 'unavailable', reason: 'stale' });
    const trigger = resolveGemDarkTrigger({
      attestationReceipt: receipt,
      nowMs,
    });
    expect(trigger).toMatchObject({
      dark: true,
      reason: 'runner-source-attestation-unavailable',
    });
  });

  it('rejects unbound listener even when otherwise healthy', () => {
    const receipt = {
      ...publisherShapedReceipt(nowMs, 10_000),
      listener: {
        port: 4041,
        pid: 456,
        wrapperPid: 123,
        controlGroup: '/user.slice/symphony-elixir.service',
        boundToService: false,
      },
    };
    expect(evaluateRunnerSourceAttestation(receipt, nowMs)).toEqual({
      status: 'unavailable',
      reason: 'unbound-listener',
    });
  });
});
