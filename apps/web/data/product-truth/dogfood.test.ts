import { describe, expect, it } from 'vitest';
import {
  buildDogfoodReceipts,
  DOGFOOD_RECEIPT_QUERIES,
  dogfoodClaims,
  parseProdReadCount,
} from './dogfood';
import { ClaimSchema } from './registry';

describe('dogfood proof generator', () => {
  it('parses the single count prod-read prints', () => {
    expect(parseProdReadCount('BEGIN\ncount\n114\n(1 row)\nCOMMIT\n')).toBe(
      114
    );
    expect(() => parseProdReadCount('BEGIN\nERROR: nope\n')).toThrow(
      /no count/
    );
  });

  it('keeps every query a single read of one count', () => {
    for (const query of DOGFOOD_RECEIPT_QUERIES) {
      expect(query.sql).toMatch(/^select count\(\*\) from /u);
      expect(query.sql).not.toMatch(/;|\b(?:insert|update|delete|set)\b/iu);
    }
  });

  it('drops zero receipts so the claim hides instead of showing 0', () => {
    const file = buildDogfoodReceipts(
      new Map([
        ['dogfood-tim-human-link-clicks-90d', 114],
        ['dogfood-tim-active-subscribers', 0],
      ]),
      '2026-10-04T00:00:00.000Z'
    );
    expect(file.receipts.map(receipt => receipt.id)).toEqual([
      'dogfood-tim-human-link-clicks-90d',
    ]);
    expect(file.receipts[0]?.statement).toBe(
      '114 human link clicks on jov.ie/tim in 90 days'
    );
  });

  it('turns receipts into measured, expiring, cited claims', () => {
    const file = buildDogfoodReceipts(
      new Map([['dogfood-tim-known-contacts', 16]]),
      '2026-10-04T00:00:00.000Z'
    );
    const [claim] = dogfoodClaims(file);
    expect(ClaimSchema.safeParse(claim).success).toBe(true);
    expect(claim).toMatchObject({
      kind: 'metric',
      source: 'measured',
      validUntil: '2026-11-03',
    });
  });
});
