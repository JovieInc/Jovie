import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceMemberSidebar } from '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberSidebar';
import type { AudienceMember } from '@/types';

vi.mock('@/components/molecules/drawer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/molecules/drawer')>();
  return {
    ...actual,
    EntitySidebarShell: ({
      children,
      entityHeader,
      isEmpty,
      emptyMessage,
    }: {
      children: ReactNode;
      entityHeader?: ReactNode;
      isEmpty?: boolean;
      emptyMessage?: string;
    }) => (
      <div>
        {isEmpty ? <div>{emptyMessage}</div> : entityHeader}
        {isEmpty ? null : children}
      </div>
    ),
  };
});

vi.mock(
  '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberActivityFeed',
  () => ({ AudienceMemberActivityFeed: () => <div>ActivityFeed</div> })
);
vi.mock(
  '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberDetails',
  () => ({ AudienceMemberDetails: () => <div>Details</div> })
);
vi.mock(
  '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberReferrers',
  () => ({ AudienceMemberReferrers: () => <div>Referrers</div> })
);

const member: AudienceMember = {
  id: 'aud-1',
  type: 'email',
  displayName: 'Jordan Reyes',
  locationLabel: 'Austin, TX',
  geoCity: 'Austin',
  geoCountry: 'US',
  visits: 3,
  engagementScore: 72,
  intentLevel: 'high',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'jordan@example.com',
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
};

describe('AudienceMemberSidebar', () => {
  it('renders DrawerHero with member title when member is provided', () => {
    render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );

    expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
  });

  it('renders secondary label (email) when displayName and email are both present', () => {
    render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );

    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
  });

  it('reserves the header contact line when an audience member has no email or phone', () => {
    render(
      <AudienceMemberSidebar
        member={{ ...member, email: null, phone: null }}
        isOpen
        onClose={() => undefined}
      />
    );

    expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-hero-subtitle-slot')).toHaveClass(
      'invisible',
      'min-h-[16px]'
    );
  });

  it('renders location and visit count in meta slot', () => {
    render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );

    expect(screen.getByText('Austin, TX')).toBeInTheDocument();
    expect(screen.getByText('3 visits')).toBeInTheDocument();
  });

  it('renders empty state message when member is null', () => {
    render(
      <AudienceMemberSidebar member={null} isOpen onClose={() => undefined} />
    );

    expect(screen.queryByText('Jordan Reyes')).not.toBeInTheDocument();
    expect(
      screen.getByText('Select a row in the table to view contact details.')
    ).toBeInTheDocument();
  });
});
