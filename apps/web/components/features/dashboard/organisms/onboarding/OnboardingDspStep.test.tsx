import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyArtistResult } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingDspStep } from './OnboardingDspStep';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  clear: vi.fn(),
  handleArtistSelect: vi.fn(),
  hook: {
    results: [] as SpotifyArtistResult[],
    state: 'idle' as 'idle' | 'loading' | 'empty' | 'error' | 'success',
  },
}));

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => ({
    results: mocks.hook.results,
    state: mocks.hook.state,
    search: mocks.search,
    searchImmediate: vi.fn(),
    clear: mocks.clear,
  }),
}));

vi.mock('next/image', () => ({
  default: () => <span data-testid='artist-image' />,
}));

vi.mock(
  '@/features/dashboard/organisms/release-provider-matrix/releases-empty-state/hooks/useSpotifyConnect',
  () => ({
    useSpotifyConnect: () => ({
      connectFromUrl: vi.fn(),
      extractSpotifyArtistId: vi.fn(() => null),
      handleArtistSelect: mocks.handleArtistSelect,
    }),
  })
);

vi.mock('@/lib/env-client', () => ({ env: { IS_E2E: false } }));

const ARTISTS: SpotifyArtistResult[] = [
  {
    id: 'open-artist',
    name: 'Velvet Route',
    followers: 12_345,
    popularity: 60,
    url: 'https://open.spotify.com/artist/open-artist',
  },
];

function renderStep(overrides: { isTransitioning?: boolean } = {}) {
  const onSkip = vi.fn();
  const view = render(
    <OnboardingDspStep
      title='Are you on Spotify?'
      isTransitioning={overrides.isTransitioning ?? false}
      onConnected={vi.fn()}
      onSkip={onSkip}
    />
  );
  return { ...view, onSkip };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hook.results = [];
  mocks.hook.state = 'idle';
});

describe('OnboardingDspStep', () => {
  it('draws the search as a host-drawn field inside the shared shell and stays axe-clean', async () => {
    const { container } = renderStep();
    const input = screen.getByTestId('spotify-link-input');

    expect(input).toHaveAttribute('data-host-drawn');
    expect(input.closest('[data-component="composite-field"]')).toHaveAttribute(
      'data-surface',
      'field'
    );
    await expectNoA11yViolations(container);
  });

  it('searches as the visitor types and selects a result with the plain button', async () => {
    const user = userEvent.setup();
    mocks.hook.results = ARTISTS;
    mocks.hook.state = 'success';
    const { container } = renderStep();

    await user.type(screen.getByTestId('spotify-link-input'), 'Velvet');
    expect(mocks.search).toHaveBeenCalled();

    const row = screen.getByRole('button', { name: /Velvet Route/ });
    expect(row).toHaveAttribute('data-slot', 'plain-button');
    expect(screen.getByText('12,345 followers')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(row);
    expect(mocks.handleArtistSelect).toHaveBeenCalledWith({
      id: 'open-artist',
      name: 'Velvet Route',
      url: ARTISTS[0].url,
    });
  });

  it('skips for now and disables skip while transitioning', async () => {
    const user = userEvent.setup();
    const first = renderStep();
    await user.click(screen.getByRole('button', { name: 'Skip For Now' }));
    expect(first.onSkip).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderStep({ isTransitioning: true });
    expect(screen.getByRole('button', { name: 'Skip For Now' })).toBeDisabled();
    await expectNoA11yViolations(second.container);
  });
});
