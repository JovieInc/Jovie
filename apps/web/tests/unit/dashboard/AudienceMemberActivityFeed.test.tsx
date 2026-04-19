import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AudienceMember } from '@/types';

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerEmptyState: ({ message }: { message: string }) => (
    <div data-testid='drawer-empty'>{message}</div>
  ),
}));

vi.mock('@/lib/utils/audience', () => ({
  formatTimeAgo: (ts: string) => ts,
}));

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

// Lazy-import so mocks are in place
const loadComponent = async () => {
  const mod = await import(
    '@/features/dashboard/organisms/audience-member-sidebar/AudienceMemberActivityFeed'
  );
  return mod.AudienceMemberActivityFeed;
};

describe('AudienceMemberActivityFeed', () => {
  it('shows empty state when no actions', async () => {
    const ActivityFeed = await loadComponent();
    render(<ActivityFeed member={baseMember} />);
    expect(screen.getByTestId('drawer-empty')).toBeInTheDocument();
  });

  it('renders actions as list items', async () => {
    const ActivityFeed = await loadComponent();
    const member: AudienceMember = {
      ...baseMember,
      latestActions: [
        { label: 'profile_view', timestamp: '2026-03-20T10:00:00Z' },
        { label: 'link_click', timestamp: '2026-03-20T09:00:00Z' },
      ],
    };
    render(<ActivityFeed member={member} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });

  it('caps displayed actions at 10', async () => {
    const ActivityFeed = await loadComponent();
    const actions = Array.from({ length: 15 }, (_, i) => ({
      label: 'profile_view',
      timestamp: `2026-03-${String(20 - i).padStart(2, '0')}T10:00:00Z`,
    }));
    const member: AudienceMember = {
      ...baseMember,
      latestActions: actions,
    };
    render(<ActivityFeed member={member} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(10);
  });

  it('sorts actions newest first', async () => {
    const ActivityFeed = await loadComponent();
    const member: AudienceMember = {
      ...baseMember,
      latestActions: [
        { label: 'older_action', timestamp: '2026-03-01T10:00:00Z' },
        { label: 'newer_action', timestamp: '2026-03-20T10:00:00Z' },
      ],
    };
    render(<ActivityFeed member={member} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toContain('Newer Action');
  });
});
