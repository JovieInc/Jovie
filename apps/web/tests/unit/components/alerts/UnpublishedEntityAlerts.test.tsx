import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useSubscribeNotificationsMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { UnpublishedEntityAlerts } from '@/components/features/alerts/UnpublishedEntityAlerts';
import type { Artist } from '@/types/db';

const ARTIST: Artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'tim',
  spotify_id: '4u',
  name: 'Tim White',
} as Artist;

describe('<UnpublishedEntityAlerts>', () => {
  it('renders still-in-the-works copy and alerts capture', () => {
    render(
      <UnpublishedEntityAlerts artist={ARTIST} entityTitle='Midnight Drive' />
    );
    expect(screen.getByTestId('unpublished-entity-alerts')).toBeInTheDocument();
    expect(screen.getByText(/still in the works/i)).toBeInTheDocument();
    expect(screen.getByText(/Midnight Drive/)).toBeInTheDocument();
    expect(screen.getByText(/Get alerts first/i)).toBeInTheDocument();
    expect(screen.getByTestId('alerts-landing-back')).toHaveAttribute(
      'href',
      '/tim'
    );
  });
});
