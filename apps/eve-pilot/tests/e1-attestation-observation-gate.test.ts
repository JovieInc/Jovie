import { describe, expect, it } from 'vitest';
import {
  e1PublisherShapedReceipt,
  evaluateE1AttestationObservations,
  verdictForObservation,
} from '../agent/lib/e1-attestation-observation-gate';
import { RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS } from '../agent/lib/summer-gem-dark-recovery';

describe('E1 attestation observation gate (post-install proof)', () => {
  const nowMs = Date.parse('2026-09-12T18:00:00.000Z');

  it('passes with two independent fresh ≤600s observations and Symphony dispatch', () => {
    const a = e1PublisherShapedReceipt({
      nowMs,
      ageMs: 30_000,
      sourceRevision: 'a'.repeat(40),
    });
    const b = e1PublisherShapedReceipt({
      nowMs,
      ageMs: 90_000,
      sourceRevision: 'b'.repeat(40),
    });
    const result = evaluateE1AttestationObservations({
      observationA: a,
      observationB: b,
      nowMs,
    });
    expect(result.status).toBe('pass');
    if (result.status !== 'pass') return;
    expect(result.governedDispatchOutcome).toBe('symphony-route');
    expect(result.weakened600sGate).toBe(false);
    expect(result.maxAgeMs).toBe(RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS);
    expect(result.remainingHumanDecision).toBeNull();
  });

  it('fails when either observation is stale (>600s) — gate not weakened', () => {
    const fresh = e1PublisherShapedReceipt({ nowMs, ageMs: 20_000 });
    const stale = e1PublisherShapedReceipt({
      nowMs,
      ageMs: RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS + 1,
    });
    const result = evaluateE1AttestationObservations({
      observationA: fresh,
      observationB: stale,
      nowMs,
    });
    expect(result.status).toBe('fail');
    if (result.status !== 'fail') return;
    expect(result.weakened600sGate).toBe(false);
    expect(result.reason).toBe(
      'one-or-both-observations-not-fresh-within-600s'
    );
    expect(verdictForObservation(stale, nowMs)).toMatchObject({
      ok: false,
      probeReason: 'stale',
    });
  });

  it('fails when observations are not independent', () => {
    const same = e1PublisherShapedReceipt({
      nowMs,
      ageMs: 40_000,
      sourceRevision: 'd'.repeat(40),
    });
    const result = evaluateE1AttestationObservations({
      observationA: same,
      observationB: { ...same },
      nowMs,
    });
    expect(result.status).toBe('fail');
    if (result.status !== 'fail') return;
    expect(result.reason).toBe('observations-not-independent');
  });
});
