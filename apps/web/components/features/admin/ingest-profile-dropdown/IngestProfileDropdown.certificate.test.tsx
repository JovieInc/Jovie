import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { IngestProfileDropdown } from './IngestProfileDropdown';
import type { UseIngestProfileReturn } from './types';

let overrides: Partial<UseIngestProfileReturn> = {};

// A stateful stand-in for the hook, so typed input really lives in state.
vi.mock('./useIngestProfile', () => ({
  useIngestProfile: (): UseIngestProfileReturn => {
    const [open, setOpen] = useState(true);
    const [inputValue, setInputValue] = useState('');
    const [network, setNetwork] =
      useState<UseIngestProfileReturn['network']>('spotify');
    return {
      open,
      setOpen,
      network,
      setNetwork,
      inputValue,
      setInputValue,
      inputPlaceholder: 'Search Spotify artists',
      isLoading: false,
      isSuccess: false,
      detectedPlatform: null,
      spotifyResults: [],
      spotifyState: 'idle',
      spotifyError: null,
      selectSpotifyArtist: vi.fn(),
      handleSubmit: vi.fn(async () => undefined),
      ...overrides,
    };
  },
}));

describe('IngestProfileDropdown certificate', () => {
  beforeEach(() => {
    overrides = {};
  });

  it('keeps the typed search and focus across a re-render', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<IngestProfileDropdown />);
    const input = screen.getByPlaceholderText('Search Spotify artists');

    await user.type(input, 'phoebe');
    rerender(<IngestProfileDropdown hideLabelOnMobile />);

    expect(screen.getByPlaceholderText('Search Spotify artists')).toHaveValue(
      'phoebe'
    );
    expect(screen.getByPlaceholderText('Search Spotify artists')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Ingest' })).toBeEnabled();
  });

  it('closes on Escape after typing', async () => {
    const user = userEvent.setup();
    render(<IngestProfileDropdown />);

    await user.type(screen.getByPlaceholderText('Search Spotify artists'), 'x');
    await user.keyboard('{Escape}');

    expect(screen.queryByText('Ingest social profile')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Ingest Profile' })
    ).toBeVisible();
  });

  it('shows the searching line while Spotify loads, axe-clean', async () => {
    overrides = { spotifyState: 'loading' };
    render(<IngestProfileDropdown />);

    expect(screen.getByText('Searching Spotify...')).toBeVisible();
    await expectNoA11yViolations(document.body);
  });

  it('shows the empty-result line, axe-clean', async () => {
    overrides = { spotifyState: 'empty' };
    render(<IngestProfileDropdown />);

    expect(
      screen.getByText('No artists found. Try a different search.')
    ).toBeVisible();
    await expectNoA11yViolations(document.body);
  });

  it('shows the search error, or its fallback, axe-clean', async () => {
    overrides = {
      spotifyState: 'error',
      spotifyError: 'Too many requests. Please wait a moment.',
    };
    const { rerender } = render(<IngestProfileDropdown />);

    expect(
      screen.getByText('Too many requests. Please wait a moment.')
    ).toBeVisible();
    await expectNoA11yViolations(document.body);

    overrides = { spotifyState: 'error', spotifyError: null };
    rerender(<IngestProfileDropdown />);
    expect(screen.getByText('Spotify search failed')).toBeVisible();
  });

  it('lists long and right-to-left artist names, axe-clean', async () => {
    overrides = {
      spotifyState: 'success',
      spotifyResults: [
        {
          id: 'a1',
          name: 'فيروز',
          url: 'https://open.spotify.com/artist/1',
          popularity: 70,
        },
        {
          id: 'a2',
          name: 'The Extraordinarily Long-Named Midnight Orchestra and Friends',
          url: 'https://open.spotify.com/artist/2',
          popularity: 40,
        },
      ],
    };
    render(
      <div dir='rtl' lang='ar'>
        <IngestProfileDropdown />
      </div>
    );

    expect(screen.getByText('فيروز')).toBeVisible();
    expect(
      screen.getByText(
        'The Extraordinarily Long-Named Midnight Orchestra and Friends'
      )
    ).toBeVisible();
    await expectNoA11yViolations(document.body);
  });
});
