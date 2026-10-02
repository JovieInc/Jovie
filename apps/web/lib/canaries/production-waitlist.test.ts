import { describe, expect, it } from 'vitest';
import { buildProductionWaitlistCanaryEmail } from '@/lib/canaries/production-waitlist';

describe('buildProductionWaitlistCanaryEmail', () => {
  it('keeps the local part and domain around the canary tag', () => {
    expect(
      buildProductionWaitlistCanaryEmail('  Synthetic@Mail.Example.CO.UK ')
    ).toBe('synthetic+jovie-prod-waitlist-canary@mail.example.co.uk');
  });

  it('rejects a base address that is already plus-tagged or missing a domain', () => {
    expect(() =>
      buildProductionWaitlistCanaryEmail('synthetic+tag@e2e.example.com')
    ).toThrow(/without plus-tagging/);
    expect(() => buildProductionWaitlistCanaryEmail('not-an-email')).toThrow(
      /without plus-tagging/
    );
  });
});
