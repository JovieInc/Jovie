import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AudienceMember } from '@/types';
import { AudienceRowActionsMenu } from './AudienceRowActionsMenu';

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const row = {
  id: 'member-1',
  type: 'email',
  displayName: 'Ada',
  locationLabel: 'Unknown',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 0,
  intentLevel: 'low',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'ada@example.com',
  phone: null,
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
} as AudienceMember;

describe('AudienceRowActionsMenu', () => {
  it('offers copy actions and hides the unfinished id action', () => {
    render(<AudienceRowActionsMenu row={row} open />);

    expect(screen.getByRole('menuitem', { name: 'Copy email' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Copy phone' })).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
