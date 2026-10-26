import { describe, expect, it } from 'vitest';
import { SCHEDULED_PRICE_CHANGES } from '@/lib/billing/price-changes/registry';
import { validateRecordShape } from '@/lib/billing/price-changes/rules';

describe('scheduled price change registry', () => {
  it('every declared record is well-formed with the full notice window', () => {
    const ids = SCHEDULED_PRICE_CHANGES.map(change => change.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const change of SCHEDULED_PRICE_CHANGES) {
      expect(validateRecordShape(change)).toEqual([]);
    }
  });
});
