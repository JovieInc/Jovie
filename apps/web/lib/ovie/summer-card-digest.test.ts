import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { summerCardPayloadDigest } from './summer-card-digest';
import { summerCardInputSchema } from './summer-cards';

const legacy = {
  idempotencyKey: 'legacy-card-0001',
  kind: 'taste',
  product: 'jov',
  title: 'Keep the new Home layout',
  body: 'Brief for Summer.',
  recommendation: 'Approve the layout.',
};

describe('summerCardPayloadDigest with facts', () => {
  it('keeps the digest of cards filed without facts, so replays still match', () => {
    const before = summerCardInputSchema.parse(legacy);
    const withEmpty = summerCardInputSchema.parse({ ...legacy, facts: [] });
    // The canonical tuple as hashed before facts existed.
    const preFacts = createHash('sha256')
      .update(
        JSON.stringify([
          'taste',
          'jov',
          legacy.title,
          legacy.body,
          legacy.recommendation,
          null,
          null,
          null,
          null,
          [],
        ])
      )
      .digest('hex');
    expect(summerCardPayloadDigest(before)).toBe(preFacts);
    expect(summerCardPayloadDigest(withEmpty)).toBe(preFacts);
  });

  it('binds filed facts into the digest', () => {
    const filed = summerCardInputSchema.parse({
      ...legacy,
      facts: ['Home loads in 1.1s at p95'],
    });
    expect(summerCardPayloadDigest(filed)).not.toBe(
      summerCardPayloadDigest(summerCardInputSchema.parse(legacy))
    );
  });

  it('refuses more than three facts or a fact longer than one line', () => {
    expect(
      summerCardInputSchema.safeParse({
        ...legacy,
        facts: ['a', 'b', 'c', 'd'],
      }).success
    ).toBe(false);
    expect(
      summerCardInputSchema.safeParse({ ...legacy, facts: ['x'.repeat(101)] })
        .success
    ).toBe(false);
  });
});
