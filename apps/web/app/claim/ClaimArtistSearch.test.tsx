import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ClaimArtistSearch } from './ClaimArtistSearch';

const RESULTS: SpotifyArtistResult[] = [
  {
    id: 'open-1',
    name: 'Open Artist',
    url: '',
    popularity: 0,
    followers: 1200,
  },
  {
    id: 'mine-1',
    name: 'My Artist',
    url: '',
    popularity: 0,
    isClaimed: true,
    isClaimedByCurrentUser: true,
  },
  {
    id: 'taken-1',
    name: 'Taken Artist',
    url: '',
    popularity: 0,
    isClaimed: true,
  },
];

const fetchMock = vi.fn<typeof fetch>();

function respondWith(body: unknown, status = 200) {
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify(body), { status })
  );
}

function searchInput() {
  return screen.getByRole('searchbox', { name: 'Find your artist on Spotify' });
}

async function typeQuery(query: string) {
  const user = userEvent.setup();
  render(<ClaimArtistSearch />);
  await user.type(searchInput(), query);
  return user;
}

describe('ClaimArtistSearch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts idle with a labelled search and a create-profile way out', async () => {
    const { container } = render(<ClaimArtistSearch />);

    expect(searchInput()).toHaveValue('');
    expect(searchInput()).toHaveAttribute('autocomplete', 'off');
    expect(
      screen.getByRole('link', { name: 'Not on Spotify? Create your profile' })
    ).toHaveAttribute('href', `${APP_ROUTES.CLAIM_START}?new=1`);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('waits for two characters before searching', async () => {
    await typeQuery('a');
    await new Promise(resolve => setTimeout(resolve, 400));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });

  it('debounces typing into one search for the trimmed query', async () => {
    respondWith(RESULTS);
    await typeQuery('  Daft Punk ');

    await screen.findByTestId('claim-artist-results');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/spotify/search?q=Daft%20Punk&limit=6');
    expect(init).toMatchObject({ cache: 'no-store' });
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('links claimable and owned artists and keeps a taken artist inert', async () => {
    respondWith(RESULTS);
    const { container } = render(<ClaimArtistSearch />);
    await userEvent.setup().type(searchInput(), 'artist');

    const claim = await screen.findByTestId('claim-artist-option');
    expect(claim).toHaveAttribute(
      'href',
      `${APP_ROUTES.CLAIM_START}?spotify=open-1`
    );
    expect(claim).toHaveTextContent('Open Artist');
    expect(claim).toHaveTextContent('1.2K followers');
    expect(claim).toHaveTextContent('Claim');

    const owned = screen.getByTestId('claim-artist-owned');
    expect(owned).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(owned).toHaveTextContent('Your profile');
    expect(owned).toHaveTextContent('Open');

    const taken = screen.getByTestId('claim-artist-claimed');
    expect(taken.tagName).toBe('DIV');
    expect(taken).toHaveAttribute('aria-disabled', 'true');
    expect(taken).toHaveTextContent('Claimed');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('encodes the Spotify id in the claim link', async () => {
    respondWith([{ ...RESULTS[0], id: 'a b/c' }]);
    await typeQuery('artist');

    expect(await screen.findByTestId('claim-artist-option')).toHaveAttribute(
      'href',
      `${APP_ROUTES.CLAIM_START}?spotify=a%20b%2Fc`
    );
  });

  it('announces the search while it is in flight', async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    const { container } = render(<ClaimArtistSearch />);
    await userEvent.setup().type(searchInput(), 'artist');

    const status = await screen.findByText('Searching…');
    expect(status.parentElement).toHaveAttribute('aria-live', 'polite');
    await expectNoA11yViolations(container);
  });

  it('says when no artist matches and keeps the create path', async () => {
    respondWith([]);
    const { container } = render(<ClaimArtistSearch />);
    await userEvent.setup().type(searchInput(), 'zzzz');

    expect(
      await screen.findByText(
        'No artists found. You can create your profile below.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Not on Spotify? Create your profile' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('explains a failed search and keeps the typed query', async () => {
    respondWith({ error: 'upstream' }, 503);
    const { container } = render(<ClaimArtistSearch />);
    await userEvent.setup().type(searchInput(), 'artist');

    expect(
      await screen.findByText(
        'Search is unavailable. Try again, or create your profile below.'
      )
    ).toBeInTheDocument();
    expect(searchInput()).toHaveValue('artist');
    await expectNoA11yViolations(container);
  });

  it('treats a dropped connection like an unavailable search', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await typeQuery('artist');

    expect(
      await screen.findByText(
        'Search is unavailable. Try again, or create your profile below.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('claim-artist-results')
    ).not.toBeInTheDocument();
  });

  it('clears results when the query drops below two characters', async () => {
    respondWith(RESULTS);
    const user = await typeQuery('ab');
    await screen.findByTestId('claim-artist-results');

    await user.type(searchInput(), '{Backspace}');

    await waitFor(() =>
      expect(
        screen.queryByTestId('claim-artist-results')
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });

  it('aborts the superseded request when the query changes', async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_url, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>(() => undefined);
    });
    const user = await typeQuery('ab');
    await screen.findByText('Searching…');

    await user.type(searchInput(), 'c');
    await waitFor(() => expect(signals).toHaveLength(2));

    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    expect(screen.queryByText(/Search is unavailable/)).not.toBeInTheDocument();
  });

  it('keeps typed input and focus through a parent rerender, Escape and blur', async () => {
    respondWith(RESULTS);
    const user = userEvent.setup();
    const { rerender } = render(<ClaimArtistSearch />);
    const input = searchInput();

    await user.type(input, 'Daft');
    await screen.findByTestId('claim-artist-results');
    rerender(<ClaimArtistSearch />);

    expect(searchInput()).toBe(input);
    expect(input).toHaveValue('Daft');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('Daft');
    expect(input).toHaveFocus();

    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('Daft');
    expect(screen.getByTestId('claim-artist-results')).toBeInTheDocument();
  });

  it('has no axe violations for long right-to-left results', async () => {
    respondWith([
      {
        id: 'long-1',
        name: 'فرقة الأوركسترا الإلكترونية الطويلة جدًا من الدار البيضاء والرباط',
        url: '',
        popularity: 0,
        followers: 2_400_000,
      },
    ]);
    const { container } = render(
      <div dir='rtl'>
        <ClaimArtistSearch />
      </div>
    );
    await userEvent.setup().type(searchInput(), 'فرقة');

    expect(await screen.findByTestId('claim-artist-option')).toHaveTextContent(
      '2.4M followers'
    );
    await expectNoA11yViolations(container);
  });
});
