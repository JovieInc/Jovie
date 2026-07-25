import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { TourDatesPageClient } from './TourDatesPageClient';

vi.mock('@/app/app/(shell)/chat/ChatEntityPanelContext', () => ({
  ChatEntityPanelProvider: ({ children }: { readonly children: ReactNode }) =>
    children,
}));

vi.mock('@/components/organisms/PageShell', () => ({
  PageShell: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/features/dashboard/organisms/tour-dates', async () => {
  const { useState } = await import('react');

  return {
    TourDatesManager: ({
      profileId,
      initialTourDates,
    }: {
      readonly profileId: string;
      readonly initialTourDates: readonly { readonly id: string }[];
    }) => {
      const [tourDates] = useState(initialTourDates);
      return (
        <div data-testid='tour-dates-manager'>
          {profileId}:{tourDates.map(tourDate => tourDate.id).join(',')}
        </div>
      );
    },
  };
});

const connectionStatus = {
  connected: false,
  hasApiKey: true,
  artistName: null,
  lastSyncedAt: null,
};

describe('TourDatesPageClient', () => {
  it('remounts profile-scoped manager state when the active profile changes', () => {
    const { rerender } = render(
      <TourDatesPageClient
        profileId='profile-a'
        initialTourDates={[{ id: 'tour-a' } as TourDateViewModel]}
        connectionStatus={connectionStatus}
      />
    );
    expect(screen.getByTestId('tour-dates-manager')).toHaveTextContent(
      'profile-a:tour-a'
    );

    rerender(
      <TourDatesPageClient
        profileId='profile-b'
        initialTourDates={[{ id: 'tour-b' } as TourDateViewModel]}
        connectionStatus={connectionStatus}
      />
    );

    expect(screen.getByTestId('tour-dates-manager')).toHaveTextContent(
      'profile-b:tour-b'
    );
    expect(screen.queryByText(/tour-a/)).toBeNull();
  });
});
