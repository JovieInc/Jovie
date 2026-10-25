import { describe, expect, it } from 'vitest';
import {
  isDogfoodReceipt,
  validateDogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';
import {
  buildMacReceipt,
  MAC_MISSIONS,
} from '../../../../../scripts/lib/mac-dogfood.mjs';

// The Mac dogfood agent (scripts/mac-dogfood.mjs) is a .mjs producer that cannot
// import the TypeScript kernel, so this contract keeps its receipts valid under
// the one validator the certification kernel uses (kind mac_closed_loop).
const identity = {
  channel: 'staging',
  version: '26.10.13-staging.39803044098.1',
  sourceRevision: 'a'.repeat(40),
};
const t0 = '2026-10-25T01:00:00.000Z';
const t1 = '2026-10-25T01:01:00.000Z';

describe('mac dogfood receipts satisfy jovie.dogfood-receipt/v1', () => {
  for (const mission of MAC_MISSIONS) {
    it(`${mission.id}: every outcome is a valid receipt`, () => {
      for (const checks of [
        [],
        [{ id: 'x', status: 'passed' }],
        [{ id: 'x', status: 'failed' }],
        [{ id: 'x', status: 'unverified' }],
      ]) {
        const receipt = buildMacReceipt({
          mission,
          checks,
          channel: 'staging',
          identity,
          web: { commitSha: 'b'.repeat(40) },
          sessionKind: 'founder',
          startedAt: t0,
          completedAt: t1,
        });
        expect(validateDogfoodReceipt(receipt)).toEqual([]);
        expect(isDogfoodReceipt(receipt)).toBe(true);
        expect(receipt.kind).toBe('mac_closed_loop');
      }
    });
  }
});
