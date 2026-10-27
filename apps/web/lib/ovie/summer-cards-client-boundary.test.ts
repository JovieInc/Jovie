import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summerCardId, summerCardPayloadDigest } from './summer-card-digest';
import { summerCardInputSchema } from './summer-cards';

const source = readFileSync(
  join(process.cwd(), 'lib/ovie/summer-cards.ts'),
  'utf8'
);

describe('summer card client boundary', () => {
  it('keeps node:crypto out of the module HUD stories import', () => {
    expect(source).not.toMatch(/from ['"]node:crypto['"]/);
    expect(source).not.toContain('summerCardId');
    expect(source).not.toContain('summerCardPayloadDigest');
  });

  it('still derives a stable id and payload digest on the server module', () => {
    const input = summerCardInputSchema.parse({
      idempotencyKey: 'decision-2026-09-26',
      kind: 'decision',
      product: 'company',
      title: 'Renew domain',
      body: 'Renew jov.ie for one year.',
      recommendation: 'Approve',
      amountUsd: 12.5,
    });
    expect(summerCardId(input.idempotencyKey)).toMatch(/^sc_[0-9a-f]{32}$/u);
    expect(summerCardId(input.idempotencyKey)).toBe(
      summerCardId(input.idempotencyKey)
    );
    const digest = summerCardPayloadDigest(input);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(
      summerCardPayloadDigest({ ...input, idempotencyKey: 'another-key-01' })
    ).toBe(digest);
    expect(summerCardPayloadDigest({ ...input, amountUsd: 13 })).not.toBe(
      digest
    );
  });
});
