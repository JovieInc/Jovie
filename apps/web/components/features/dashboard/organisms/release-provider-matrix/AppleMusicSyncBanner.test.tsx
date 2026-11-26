// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { DspMatch } from '@/lib/queries/useDspMatchesQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mocks = vi.hoisted(() => ({
  useDspMatchesQuery: vi.fn(() => ({ data: [], isLoading: false })),
  confirm: { isPending: false, mutate: vi.fn(), variables: undefined },
  reject: { isPending: false, mutate: vi.fn(), variables: undefined },
}));

vi.mock('@/lib/queries', () => ({
  useDspMatchesQuery: mocks.useDspMatchesQuery,
  useConfirmDspMatchMutation: () => mocks.confirm,
  useRejectDspMatchMutation: () => mocks.reject,
}));

import { AppleMusicSyncBanner } from './AppleMusicSyncBanner';

type Props = ComponentProps<typeof AppleMusicSyncBanner>;

const release = { providers: [] } as unknown as ReleaseViewModel;

const match: DspMatch = {
  id: 'match-1',
  providerId: 'apple_music',
  externalArtistId: 'apple-artist-1',
  externalArtistName: 'Sasha Waves',
  externalArtistUrl: 'https://music.apple.com/artist/sasha-waves',
  externalArtistImageUrl: null,
  confidenceScore: 0.92,
  confidenceBreakdown: null,
  matchingIsrcCount: 12,
  matchingUpcCount: 2,
  totalTracksChecked: 14,
  status: 'suggested',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function renderBanner(overrides: Partial<Props> = {}) {
  return render(
    <AppleMusicSyncBanner
      profileId='profile-1'
      spotifyConnected
      releases={[release]}
      matches={[match]}
      isLoading={false}
      {...overrides}
    />
  );
}

describe('AppleMusicSyncBanner certificate', () => {
  beforeEach(() => {
    mocks.confirm = { isPending: false, mutate: vi.fn(), variables: undefined };
    mocks.reject = { isPending: false, mutate: vi.fn(), variables: undefined };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('confirms, dismisses and opens a suggested match', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const { container } = renderBanner();

    expect(screen.getByText('Sasha Waves')).toBeInTheDocument();
    expect(
      screen.getByText('Confirm to link your Apple Music releases.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(mocks.confirm.mutate).toHaveBeenCalledWith({
      matchId: 'match-1',
      profileId: 'profile-1',
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.reject.mutate).toHaveBeenCalledWith({
      matchId: 'match-1',
      profileId: 'profile-1',
    });

    await user.click(
      screen.getByRole('button', { name: 'View On Apple Music' })
    );
    expect(open).toHaveBeenCalledWith(
      'https://music.apple.com/artist/sasha-waves',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('locks both actions and names the pending one while confirming', async () => {
    mocks.confirm = {
      isPending: true,
      mutate: vi.fn(),
      variables: { matchId: 'match-1' } as never,
    };
    const { container } = renderBanner({
      matches: [{ ...match, externalArtistUrl: null }],
    });

    expect(
      screen.getByRole('button', { name: 'Confirming...' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'View On Apple Music' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('names the dismissal while it is pending', () => {
    mocks.reject = {
      isPending: true,
      mutate: vi.fn(),
      variables: { matchId: 'match-1' } as never,
    };
    renderBanner();

    expect(
      screen.getByRole('button', { name: 'Dismissing...' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('confirms and dismisses from the compact pill', async () => {
    const user = userEvent.setup();
    const { container } = renderBanner({ compact: true });

    expect(screen.getByText('Match: Sasha Waves')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mocks.confirm.mutate).toHaveBeenCalledWith({
      matchId: 'match-1',
      profileId: 'profile-1',
    });
    expect(mocks.reject.mutate).toHaveBeenCalledWith({
      matchId: 'match-1',
      profileId: 'profile-1',
    });
  });

  it.each([
    [false, 'No Apple Music match found'],
    [true, 'No Apple Music match'],
  ])('reports no match without actions (compact %s)', async (compact, copy) => {
    const { container } = renderBanner({ matches: [], compact });

    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it.each<[string, Partial<Props>]>([
    ['eligibility is loading', { isLoading: true }],
    ['Spotify is not connected', { spotifyConnected: false }],
    ['there are no releases', { releases: [] }],
    [
      'a release already has an Apple Music link',
      {
        matches: [],
        releases: [
          {
            providers: [
              { key: 'apple_music', url: 'https://music.apple.com/x' },
            ],
          } as unknown as ReleaseViewModel,
        ],
      },
    ],
  ])('renders nothing when %s', async (_label, overrides) => {
    const { container } = renderBanner(overrides);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('reports a confirmed match to the parent and stays hidden', () => {
    const onMatchStatusChange = vi.fn();
    const { container } = renderBanner({
      matches: [{ ...match, status: 'confirmed' }],
      onMatchStatusChange,
    });

    expect(onMatchStatusChange).toHaveBeenCalledWith(true, 'Sasha Waves');
    expect(container).toBeEmptyDOMElement();
  });
});
