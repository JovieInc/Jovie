import type { CommonDropdownItem } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceMemberSidebar } from '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberSidebar';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';

vi.mock('@/components/molecules/drawer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/molecules/drawer')>();
  return {
    ...actual,
    EntityTabbedRail: ({
      children,
      entityHeader,
      isEmpty,
      emptyMessage,
      activeTab,
      onTabChange,
      tabOptions,
      tabsAriaLabel,
      tabbedCardTestId,
      testId,
    }: {
      children: ReactNode;
      entityHeader?: ReactNode;
      isEmpty?: boolean;
      emptyMessage?: string;
      activeTab: string;
      onTabChange: (value: string) => void;
      tabOptions: ReadonlyArray<{ value: string; label: ReactNode }>;
      tabsAriaLabel: string;
      tabbedCardTestId?: string;
      testId?: string;
    }) => (
      <div data-testid={testId} data-surface-variant='flat'>
        {isEmpty ? <div>{emptyMessage}</div> : entityHeader}
        {isEmpty ? null : (
          <div data-testid={tabbedCardTestId} data-surface-variant='flat'>
            <div role='tablist' aria-label={tabsAriaLabel}>
              {tabOptions.map(option => (
                <button
                  key={option.value}
                  type='button'
                  role='tab'
                  aria-selected={activeTab === option.value}
                  onClick={() => onTabChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {children}
          </div>
        )}
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
  emailVisibleToArtist: true,
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
};

const audienceActionItems: CommonDropdownItem[] = [
  {
    type: 'action',
    id: 'copy-email',
    label: 'Copy Email',
    icon: Copy,
    onClick: vi.fn(),
  },
];

describe('AudienceMemberSidebar', () => {
  it('renders the canonical audience header with the member title', async () => {
    const { container } = render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );

    expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders secondary label (email) when displayName and email are both present', () => {
    render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );

    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
  });

  it('uses location and visits when no contact detail is available', () => {
    render(
      <AudienceMemberSidebar
        member={{ ...member, email: null, phone: null }}
        isOpen
        onClose={() => undefined}
      />
    );

    expect(screen.getByText('Jordan Reyes')).toBeInTheDocument();
    expect(screen.getByTestId('entity-header-details-row')).toHaveTextContent(
      'Austin, TX · 3 visits'
    );
    expect(
      screen
        .getByTestId('audience-member-header-card')
        .querySelector('.invisible')
    ).toBeNull();
  });

  it('keeps the canonical entity-header geometry around the close action', () => {
    render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );

    expect(screen.getByTestId('audience-member-header-card')).toHaveClass(
      'grid',
      'grid-cols-[auto_minmax(0,1fr)_auto]',
      'px-3',
      'pt-3',
      'items-center'
    );
    expect(screen.getByTestId('audience-member-header-card')).not.toHaveClass(
      'px-2',
      'py-2'
    );
    expect(screen.getByTestId('audience-member-header-card')).toHaveAttribute(
      'data-layout',
      'grid'
    );
    expect(
      screen.getByRole('button', { name: 'More actions' })
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('button', { name: 'More actions' })
        .closest('[data-entity-header-actions]')
    ).not.toBeNull();
    const avatarFrame = screen.getByTestId('audience-entity-avatar-frame');
    expect(avatarFrame).toHaveClass('size-14', 'rounded-full');
    expect(avatarFrame.firstElementChild).toHaveClass(
      'h-full',
      'w-full',
      'rounded-full'
    );
    expect(screen.getByTestId('audience-member-sidebar')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    expect(screen.getByTestId('audience-member-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
  });

  it('uses the same canonical actions in the header overflow and drawer context menu', async () => {
    const user = userEvent.setup();

    render(
      <AudienceMemberSidebar
        member={member}
        isOpen
        onClose={() => undefined}
        contextMenuItems={audienceActionItems}
      />
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menuitem', { name: 'Copy Email' })).toBeVisible();
  });

  it('uses email as the only header detail when present', () => {
    render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );
    expect(screen.getByTestId('entity-header-details-row')).toHaveTextContent(
      'jordan@example.com'
    );
    expect(screen.queryByTestId('entity-header-meta-slot')).toBeNull();
  });

  it('omits the details line for a sparse member', () => {
    render(
      <AudienceMemberSidebar
        member={{
          ...member,
          email: null,
          phone: null,
          locationLabel: '',
          visits: 0,
        }}
        isOpen
        onClose={() => undefined}
      />
    );
    expect(screen.queryByTestId('entity-header-details-row')).toBeNull();
  });

  it('keeps each consumer state behind the shared tab contract', async () => {
    const user = userEvent.setup();
    render(
      <AudienceMemberSidebar member={member} isOpen onClose={() => undefined} />
    );

    await user.click(screen.getByRole('tab', { name: 'Sources' }));

    expect(screen.getByTestId('audience-sources-card')).toHaveTextContent(
      'Referrers'
    );
    expect(
      screen.queryByTestId('audience-details-card')
    ).not.toBeInTheDocument();
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
