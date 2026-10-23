import { describe, expect, it } from 'vitest';
import { getOutboundClaimUrl } from './claim-url';

describe('getOutboundClaimUrl', () => {
  it('always points at the production public claim route', () => {
    expect(getOutboundClaimUrl('tok-1')).toBe('https://jov.ie/claim/tok-1');
  });

  it('ignores the deploy host, so staging never leaks into outreach', () => {
    const previous = process.env.NEXT_PUBLIC_PROFILE_URL;
    process.env.NEXT_PUBLIC_PROFILE_URL = 'https://staging.jov.ie';
    try {
      const url = getOutboundClaimUrl('tok-2');
      expect(url).not.toContain('staging');
      expect(url).not.toContain('/app/');
    } finally {
      process.env.NEXT_PUBLIC_PROFILE_URL = previous;
    }
  });
});
