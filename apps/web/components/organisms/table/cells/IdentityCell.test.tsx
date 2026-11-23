import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AudienceMember } from '@/types';
import { AudienceFanCell } from '../../../features/dashboard/organisms/dashboard-audience-table/cells/AudienceFanCell';
import { IdentityCell } from './IdentityCell';

describe('IdentityCell', () => {
  it('renders the name with initials when there is no photo', () => {
    const { container } = render(<IdentityCell name='Sasha Fan' />);
    expect(screen.getByText('Sasha Fan')).toBeVisible();
    expect(container.querySelector('[data-table-person-cell]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="app-avatar"]')
    ).toHaveTextContent('SF');
  });

  it('shows a contact chip as the quiet secondary fact', () => {
    render(<IdentityCell name='Sasha Fan' secondary='sasha@example.com' />);
    expect(screen.getByText('sasha@example.com')).toHaveClass(
      'text-tertiary-token'
    );
  });

  it('shows a descriptor when no contact chip exists', () => {
    render(<IdentityCell name='Jamie' secondary='Los Angeles, US' />);
    expect(screen.getByText('Los Angeles, US')).toBeInTheDocument();
  });

  it('omits the secondary span when there is none', () => {
    const { container } = render(<IdentityCell name='Jamie' />);
    expect(container.querySelector('.text-tertiary-token')).toBeNull();
  });

  it('uses a neutral mark for an anonymous visitor instead of initials', () => {
    const { container } = render(
      <IdentityCell name='Anonymous visitor' anonymous />
    );
    expect(
      container.querySelector('[data-slot="app-avatar"]')
    ).toHaveTextContent('?');
    expect(container).not.toHaveTextContent('AV');
  });

  it('links the name only when nameHref is given', () => {
    render(<IdentityCell name='Linked' nameHref='/app/audience/1' />);
    expect(screen.getByRole('link', { name: 'Linked' })).toHaveAttribute(
      'href',
      '/app/audience/1'
    );
  });
});

const anonymousMember = {
  id: 'a1',
  type: 'anonymous',
  displayName: null,
  locationLabel: '',
  geoCity: 'Los Angeles',
  geoCountry: null,
  visits: 1,
  engagementScore: 0,
  intentLevel: 'low',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: null,
  emailVisibleToArtist: false,
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
} as AudienceMember;

describe('IdentityCell as the audience fan cell', () => {
  it('falls back to "Anonymous visitor" with a location descriptor', () => {
    render(<AudienceFanCell member={anonymousMember} />);
    expect(screen.getByText('Anonymous visitor')).toBeInTheDocument();
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
  });
});
