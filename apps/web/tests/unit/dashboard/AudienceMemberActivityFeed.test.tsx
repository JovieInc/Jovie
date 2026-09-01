import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AudienceMember } from '@/types';

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerInlineNote: ({
    message,
    className,
  }: {
    message: string;
    className?: string;
  }) => (
    <div data-class-name={className} data-testid='drawer-empty'>
      {message}
    </div>
  ),
}));

vi.mock('@/lib/utils/audience', () => ({
  formatTimeAgo: (ts: string) => ts,
}));

import { AudienceMemberActivityFeed } from '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberActivityFeed';

const baseMember: AudienceMember = {
  id: 'test-1',
  type: 'anonymous',
  displayName: null,
  locationLabel: '',
  geoCity: null,
  geoCountry: null,
  visits: 0,
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

describe('AudienceMemberActivityFeed', () => {
  it('shows empty state when no actions', () => {
    render(<AudienceMemberActivityFeed member={baseMember} />);
    expect(screen.getByTestId('drawer-empty')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-empty')).not.toHaveAttribute(
      'data-class-name'
    );
  });

  it('renders actions as list items', () => {
    const member: AudienceMember = {
      ...baseMember,
      latestActions: [
        { label: 'profile_view', timestamp: '2026-03-20T10:00:00Z' },
        { label: 'link_click', timestamp: '2026-03-20T09:00:00Z' },
      ],
    };
    render(<AudienceMemberActivityFeed member={member} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('uses the shared activity timeline row contract for compact drawer activity', () => {
    const member: AudienceMember = {
      ...baseMember,
      latestActions: [
        {
          label: 'profile_view',
          sourceLabel: 'Instagram',
          timestamp: '2026-03-20T10:00:00Z',
        },
      ],
    };

    render(<AudienceMemberActivityFeed member={member} />);

    expect(screen.getByTestId('activity-timeline-row-shell')).toHaveClass(
      'gap-3',
      'px-1.5',
      'py-1'
    );
    expect(screen.getByTestId('activity-timeline-leading')).toHaveClass(
      'h-6',
      'w-6',
      'rounded-full'
    );
    expect(screen.getByTestId('activity-timeline-timestamp')).toHaveAttribute(
      'dateTime',
      '2026-03-20T10:00:00Z'
    );
  });

  it('caps displayed actions at 10', () => {
    const actions = Array.from({ length: 15 }, (_, i) => ({
      label: 'profile_view',
      timestamp: `2026-03-${String(20 - i).padStart(2, '0')}T10:00:00Z`,
    }));
    const member: AudienceMember = {
      ...baseMember,
      latestActions: actions,
    };
    render(<AudienceMemberActivityFeed member={member} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(10);
  });

  it('sorts actions newest first', () => {
    const member: AudienceMember = {
      ...baseMember,
      latestActions: [
        { label: 'older_action', timestamp: '2026-03-01T10:00:00Z' },
        { label: 'newer_action', timestamp: '2026-03-20T10:00:00Z' },
      ],
    };
    render(<AudienceMemberActivityFeed member={member} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Newer Action');
  });
});
