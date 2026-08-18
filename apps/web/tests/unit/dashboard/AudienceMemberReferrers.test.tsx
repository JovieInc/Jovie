import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudienceMemberReferrers } from '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberReferrers';
import type { AudienceMember } from '@/types';

const memberWithoutSources: AudienceMember = {
  id: 'audience-no-sources',
  type: 'anonymous',
  displayName: null,
  locationLabel: '',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 0,
  intentLevel: 'low',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: null,
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
};

describe('AudienceMemberReferrers', () => {
  it('places its empty state on the canonical flat note surface', () => {
    const { container } = render(
      <AudienceMemberReferrers member={memberWithoutSources} />
    );

    const note = screen.getByText('No source data yet.').parentElement;

    expect(note).toHaveAttribute('data-surface-variant', 'flat');
    expect(note).toHaveClass('min-h-22', 'bg-transparent', 'shadow-none');
    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(0);
  });
});
