import { describe, expect, it } from 'vitest';
import {
  classifyProjectionSuccessor,
  ovieShippingProjectionSchema,
  ovieTruthStateSchema,
  projectOperationalTruthForRead,
} from '@/lib/ovie/operational-truth';
import { shippingProjection } from '@/tests/fixtures/ovie-operational-truth';

const projection = shippingProjection;
describe('ovie shipping-state projection', () => {
  it('preserves authoritative zero values and every lifecycle state', () => {
    for (const status of ovieTruthStateSchema.options) {
      const candidate = projection({ status });
      expect(ovieShippingProjectionSchema.parse(candidate).status).toBe(status);
    }
  });
  it('rejects non-operational payload fields and false-green aggregates', () => {
    const candidate = structuredClone(projection());
    candidate.sources[0].facts.transcript = 'founder-only sentinel';
    expect(ovieShippingProjectionSchema.safeParse(candidate).success).toBe(
      false
    );
    const mismatch = structuredClone(projection());
    mismatch.sources[0].status = 'unavailable';
    expect(ovieShippingProjectionSchema.safeParse(mismatch).success).toBe(
      false
    );
  });
  it('expires fresh and recovery values without replacing them with zero', () => {
    const current = projection();
    const read = projectOperationalTruthForRead(
      current,
      new Date('2026-08-22T03:00:06.000Z')
    );
    expect(read.status).toBe('stale');
    expect(read.projection?.sources[0].status).toBe('stale');
    expect(read.projection?.sources[0].facts.implementing).toBe(0);
  });
  it('accepts only a contiguous lineage and treats an identical retry as duplicate', () => {
    const current = projection();
    const next = projection({
      sequence: 2,
      previousProjectionId: current.projectionId,
    });
    expect(classifyProjectionSuccessor(null, current)).toBe('accepted');
    expect(classifyProjectionSuccessor(current, current)).toBe('duplicate');
    const divergent = structuredClone(current);
    divergent.sources[0].facts.implementing = 1;
    expect(classifyProjectionSuccessor(current, divergent)).toBe('conflict');
    expect(classifyProjectionSuccessor(current, next)).toBe('accepted');
    expect(
      classifyProjectionSuccessor(
        current,
        projection({ sequence: 3, previousProjectionId: current.projectionId })
      )
    ).toBe('conflict');
    expect(
      classifyProjectionSuccessor(
        current,
        projection({ sequence: 2, previousProjectionId: crypto.randomUUID() })
      )
    ).toBe('conflict');
  });
});
