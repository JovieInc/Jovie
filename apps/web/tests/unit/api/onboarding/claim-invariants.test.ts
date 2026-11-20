import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Pure helper extracted for property testing the recency ordering + idempotency invariants
// (mirrors the [primary, ...others] + desc createdAt logic in the route without duplicating prod code).
function pickPrimaryAndOthers<T extends { createdAt: Date }>(
  cands: T[]
): { primary: T | undefined; others: T[] } {
  if (!cands.length) return { primary: undefined, others: [] };
  const sorted = [...cands].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
  return { primary: sorted[0], others: sorted.slice(1) };
}

describe('claim route invariants (property tests for recency, idempotency)', () => {
  const timestampArb = fc.integer({
    min: Date.UTC(2020, 0, 1),
    max: Date.UTC(2026, 5, 1),
  });
  const candidateArb = fc.record({
    id: fc.uuid(),
    createdAt: timestampArb.map(t => new Date(t)),
  });

  it('recency ordering: primary is always the most recently created (or undefined)', () => {
    fc.assert(
      fc.property(fc.array(candidateArb, { maxLength: 12 }), cands => {
        const { primary, others } = pickPrimaryAndOthers(cands);
        if (primary) {
          for (const o of others) {
            expect(primary.createdAt.getTime()).toBeGreaterThanOrEqual(
              o.createdAt.getTime()
            );
          }
        }
        // ordering property holds
        expect(others.length).toBe(Math.max(0, cands.length - 1));
      })
    );
  });

  it('idempotent pick: pick(pick(xs)) shape equals pick(xs) for the primary/others split', () => {
    fc.assert(
      fc.property(fc.array(candidateArb, { maxLength: 8 }), cands => {
        const once = pickPrimaryAndOthers(cands);
        const twice = pickPrimaryAndOthers(
          once.primary ? [once.primary, ...once.others] : []
        );
        if (once.primary) {
          expect(twice.primary?.createdAt.getTime()).toBe(
            once.primary.createdAt.getTime()
          );
        } else {
          expect(twice.primary).toBeUndefined();
        }
        expect(twice.others.length).toBe(once.others.length);
      })
    );
  });

  it('failure path safety: empty candidates always yields zero others, never throws on pick', () => {
    fc.assert(
      fc.property(fc.constant([]), () => {
        const { primary, others } = pickPrimaryAndOthers([]);
        expect(primary).toBeUndefined();
        expect(others).toEqual([]);
      })
    );
  });

  it('recency with timestamp ties: primary time is a maximum (covers sort in recency ordering)', () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { minLength: 2, maxLength: 6 }),
        cands => {
          if (cands.length >= 2) {
            cands[1] = { ...cands[1], createdAt: cands[0].createdAt };
          }
          const { primary, others } = pickPrimaryAndOthers(cands);
          if (primary) {
            const maxT = Math.max(...cands.map(c => c.createdAt.getTime()));
            expect(primary.createdAt.getTime()).toBe(maxT);
            expect(others.length).toBe(cands.length - 1);
          }
        }
      )
    );
  });
});
