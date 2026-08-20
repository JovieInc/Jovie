import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const { mockContactsQueryState, refetch } = vi.hoisted(() => ({
  mockContactsQueryState: {
    data: null as null | typeof mockContacts,
    isLoading: false,
    isError: false,
  },
  refetch: vi.fn(),
}));

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
    ...mockContactsQueryState,
    refetch,
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
  beforeEach(() => {
    mockContactsQueryState.data = mockContacts;
    mockContactsQueryState.isLoading = false;
    mockContactsQueryState.isError = false;
    refetch.mockReset();
  });

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
    expect(screen.getByText('Team Contacts')).toBeVisible();

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

  it('uses the canonical panel body for its loading state', () => {
    mockContactsQueryState.data = null;
    mockContactsQueryState.isLoading = true;

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RightPanelProvider>
          <SettingsContactsSection artist={mockArtist} />
        </RightPanelProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('Team Contacts')).toBeInTheDocument();
    expect(document.querySelector('.px-4.py-4')).toHaveClass('sm:px-5');
  });

  it('keeps contact load errors recoverable without a nested card', () => {
    mockContactsQueryState.data = null;
    mockContactsQueryState.isError = true;

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RightPanelProvider>
          <SettingsContactsSection artist={mockArtist} />
        </RightPanelProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('Unable To Load Contacts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Unable To Load Contacts')).toHaveLength(1);
  });

  it('uses the canonical empty-state hierarchy when no contacts exist', () => {
    mockContactsQueryState.data = [];

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RightPanelProvider>
          <SettingsContactsSection artist={mockArtist} />
        </RightPanelProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add your first contact to get started.')
    ).toBeInTheDocument();
  });
});
