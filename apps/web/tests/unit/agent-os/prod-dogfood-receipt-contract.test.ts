import { describe, expect, it } from 'vitest';
import {
  isDogfoodReceipt,
  validateDogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';
import {
  buildReceipt,
  MISSIONS,
} from '../../../../../scripts/lib/prod-dogfood.mjs';

// The production dogfood agent (scripts/prod-dogfood.mjs) is a .mjs producer
// that cannot import the TypeScript kernel, so this contract keeps its
// receipts valid under the one validator the certification kernel uses.
const binding = { commitSha: 'c'.repeat(40), deploymentId: 'dpl_contract' };
const t0 = '2026-10-25T01:00:00.000Z';
const t1 = '2026-10-25T01:01:00.000Z';

describe('prod dogfood receipts satisfy jovie.dogfood-receipt/v1', () => {
  for (const mission of MISSIONS) {
    it(`${mission.id}: every outcome is a valid receipt`, () => {
      for (const checks of [
        [],
        [{ id: 'x', status: 'passed' }],
        [{ id: 'x', status: 'failed' }],
        [{ id: 'x', status: 'unverified' }],
      ]) {
        const receipt = buildReceipt({
          mission,
          checks,
          binding,
          startedAt: t0,
          completedAt: t1,
        });
        expect(validateDogfoodReceipt(receipt)).toEqual([]);
        expect(isDogfoodReceipt(receipt)).toBe(true);
      }
    });
  }

  it('a blocked mission never proves an outcome', () => {
    const blocked = MISSIONS.find(m => m.automation === 'blocked');
    const receipt = buildReceipt({
      mission: blocked,
      checks: [],
      binding,
      startedAt: t0,
      completedAt: t1,
    });
    expect(receipt.outcome).toBe('blocked');
  });
});
