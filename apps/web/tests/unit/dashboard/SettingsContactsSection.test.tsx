import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { SettingsContactsSection } from '@/features/dashboard/organisms/SettingsContactsSection';
import type { Artist } from '@/types/db';

const mockContacts = vi.hoisted(() => [
  {
    id: 'contact-1',
    creatorProfileId: 'profile-1',
    role: 'management',
    customLabel: null,
    personName: 'Kelly Strickland',
    companyName: null,
    territories: [],
    email: 'kelly@example.com',
    phone: null,
    preferredChannel: null,
    isActive: true,
    sortOrder: 0,
  },
]);

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: () => ({
    selectedProfile: {
      usernameNormalized: 'timwhite',
      username: 'timwhite',
    },
  }),
}));

vi.mock('@/lib/queries/useContactsQuery', () => ({
  useContactsQuery: () => ({
    data: mockContacts,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock(
  '@/features/dashboard/organisms/contacts-table/ContactDetailSidebar',
  () => ({
    ContactDetailSidebar: ({ isOpen }: { isOpen: boolean }) => (
      <div data-testid='contact-detail-sidebar' data-open={isOpen} />
    ),
  })
);

function RightPanelRenderer() {
  const panel = useRightPanel();
  return <>{panel}</>;
}

const mockArtist: Artist = {
  id: 'profile-1',
  owner_user_id: 'user-1',
  handle: 'timwhite',
  spotify_id: 'spotify-1',
  name: 'Tim White',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('SettingsContactsSection', () => {
  it('registers the contact sidebar in the right panel', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RightPanelProvider>
          <SettingsContactsSection artist={mockArtist} />
          <RightPanelRenderer />
        </RightPanelProvider>
      </QueryClientProvider>
    );

    const sidebar = await screen.findByTestId('contact-detail-sidebar');
    expect(sidebar).toHaveAttribute('data-open', 'false');

    const label = screen.getByText('Management');
    const row = label.closest('button');
    expect(row).not.toBeNull();
    if (!row) {
      throw new TypeError('Expected contact row button to exist.');
    }
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
        'data-open',
        'true'
      );
    });
  });
});
