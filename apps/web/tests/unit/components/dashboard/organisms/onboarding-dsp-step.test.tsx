import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingDspStep } from '@/components/features/dashboard/organisms/onboarding/OnboardingDspStep';
import type { SpotifyArtistResult } from '@/lib/queries';

// --- Mocks ---

const mockSearch = vi.fn();
const mockSearchImmediate = vi.fn();
const mockClear = vi.fn();
const mockHookReturn = {
  results: [] as SpotifyArtistResult[],
  state: 'idle' as 'idle' | 'loading' | 'empty' | 'error' | 'success',
  search: mockSearch,
  searchImmediate: mockSearchImmediate,
  clear: mockClear,
};

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => mockHookReturn,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, unoptimized, ...rest } = props;
    return <img alt='' {...rest} />;
  },
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/releases-empty-state/hooks/useSpotifyConnect',
  () => ({
    useSpotifyConnect: () => ({
      connectFromUrl: vi.fn(),
      extractSpotifyArtistId: vi.fn(() => null),
      handleArtistSelect: vi.fn(),
    }),
  })
);

vi.mock('@/lib/env-client', () => ({
  env: { IS_E2E: false },
}));

// --- Fixtures ---

const ARTISTS: SpotifyArtistResult[] = [
  {
    id: 'claimed-artist',
    name: 'Nova Crown',
    popularity: 80,
    url: 'https://open.spotify.com/artist/claimed-artist',
  },
  {
    id: 'open-artist',
    name: 'Velvet Route',
    followers: 12_345,
    popularity: 60,
    url: 'https://open.spotify.com/artist/open-artist',
  },
];

function renderComponent() {
  return render(
    <OnboardingDspStep
      isTransitioning={false}
      onConnected={vi.fn()}
      onSkip={vi.fn()}
      title='Connect your music'
    />
  );
}

function typeQuery(query: string) {
  return userEvent.type(
    screen.getByPlaceholderText(/Search for your artist/i),
    query
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHookReturn.results = [];
  mockHookReturn.state = 'idle';
});

afterEach(() => {
  cleanup();
});

// JOV-6553: claimed ≠ membership. Expected copy authored from the approved
// contract, not from the component implementation.
describe('OnboardingDspStep truthful artist status', () => {
  it('shows results when a query is typed', async () => {
    mockHookReturn.results = ARTISTS;
    mockHookReturn.state = 'success';
    renderComponent();
    await typeQuery('Nova');
    expect(screen.getByText('Nova Crown')).toBeInTheDocument();
  });

  it('claimed artists show the truthful listing badge, never "On Jovie"', async () => {
    mockHookReturn.results = ARTISTS.map(artist => ({
      ...artist,
      isClaimed: artist.id === 'claimed-artist',
    }));
    mockHookReturn.state = 'success';
    renderComponent();
    await typeQuery('Nova');

    const badge = screen.getByTestId('listing-badge');
    expect(badge).toHaveTextContent('Jovie listing');
    expect(badge.textContent).not.toContain('On Jovie');
  });

  it('claimed artists remain selectable — the server-side identity lock owns denial', async () => {
    mockHookReturn.results = ARTISTS.map(artist => ({
      ...artist,
      isClaimed: artist.id === 'claimed-artist',
    }));
    mockHookReturn.state = 'success';
    renderComponent();
    await typeQuery('Nova');

    const row = screen.getByText('Nova Crown').closest('button')!;
    expect(row).toBeEnabled();
  });

  it('unclaimed artists show no listing badge', async () => {
    mockHookReturn.results = ARTISTS.map(artist => ({
      ...artist,
      isClaimed: artist.id === 'claimed-artist',
    }));
    mockHookReturn.state = 'success';
    renderComponent();
    await typeQuery('Velvet');

    const row = screen.getByText('Velvet Route').closest('button');
    expect(row).not.toBeNull();
    expect(
      row?.querySelector('[data-testid="listing-badge"]')
    ).not.toBeInTheDocument();
  });
});
