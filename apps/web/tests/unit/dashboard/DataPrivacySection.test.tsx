import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataPrivacySection } from '@/components/features/dashboard/organisms/DataPrivacySection';
import type { Artist } from '@/types/db';

describe('DataPrivacySection', () => {
  it('owns destructive settings-row tone for account deletion', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <DataPrivacySection />
      </QueryClientProvider>
    );

    const title = screen.getByText('Delete your account');
    const row = title.closest('[data-tone="destructive"]');

    expect(row).toHaveAttribute('data-state', 'idle');
    expect(title).toHaveClass('text-error');
    expect(
      screen.getByText(
        'Permanently remove your account, profile, contacts, and all associated data. This action cannot be undone.'
      )
    ).toHaveClass('text-secondary-token');
    expect(
      screen.getByRole('button', { name: 'Delete Account' })
    ).toBeEnabled();
  });
  it('includes the selected owner profile discovery control alongside account actions', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const artist = {
      id: 'owner-profile',
      owner_user_id: 'owner',
      handle: 'artist',
      spotify_id: '',
      name: 'Artist',
      published: false,
      is_verified: false,
      is_featured: false,
      marketing_opt_out: false,
      created_at: '2026-10-17T00:00:00Z',
      settings: { searchable: false },
    } satisfies Artist;
    render(
      <QueryClientProvider client={queryClient}>
        <DataPrivacySection artist={artist} />
      </QueryClientProvider>
    );
    expect(
      screen.getByRole('switch', { name: 'Show in Jovie discovery' })
    ).not.toBeChecked();
    expect(screen.getByRole('switch')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export data' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Delete Account' })
    ).toBeVisible();
  });
});
