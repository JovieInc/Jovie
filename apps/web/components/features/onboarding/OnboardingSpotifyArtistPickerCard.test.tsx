import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingSpotifyArtistPickerCard } from './OnboardingSpotifyArtistPickerCard';

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    error: null,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
    query: '',
    isPending: false,
  }),
}));

describe('OnboardingSpotifyArtistPickerCard', () => {
  it('keeps the typed query in a host-drawn field', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingSpotifyArtistPickerCard
        state='output-available'
        output={{ action: 'open_artist_picker', query: null }}
        onSelectArtist={vi.fn()}
      />
    );
    const input = screen.getByPlaceholderText('Search Spotify artists');
    expect(input).toHaveAttribute('data-host-drawn');
    await user.type(input, 'Alex');
    expect(input).toHaveValue('Alex');
    await expectNoA11yViolations(container);
  });

  it('announces a failed search as an alert', () => {
    render(
      <OnboardingSpotifyArtistPickerCard
        state='output-error'
        onSelectArtist={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Spotify search did not load'
    );
  });
});
