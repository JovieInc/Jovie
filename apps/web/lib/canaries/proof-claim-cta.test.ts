import { describe, expect, it } from 'vitest';
import { inspectProofClaimCta } from './proof-claim-cta';

describe('proof-claim CTA canary inspect (JOV-6439 overlap)', () => {
  it('finds the AEO claim CTA without treating the profile as unclaimed', () => {
    const document = new DOMParser().parseFromString(
      '<a data-testid="profile-aeo-claim-cta" href="/waitlist?campaign=proof-to-claim">Request access</a>',
      'text/html'
    );
    expect(inspectProofClaimCta(document)).toEqual({
      present: true,
      label: 'Request access',
      href: '/waitlist?campaign=proof-to-claim',
    });
  });

  it('reports missing CTA without failing closed on unrelated markup', () => {
    const document = new DOMParser().parseFromString(
      '<section data-testid="profile-aeo-content">About</section>',
      'text/html'
    );
    expect(inspectProofClaimCta(document)).toEqual({
      present: false,
      label: null,
      href: null,
    });
  });
});
