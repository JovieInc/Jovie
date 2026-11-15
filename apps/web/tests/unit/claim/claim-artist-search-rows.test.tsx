import { buttonVariants } from '@jovie/ui';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimArtistSearch } from '@/app/claim/ClaimArtistSearch';
import { APP_ROUTES } from '@/constants/routes';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import { renderWithQueryClient as render } from '@/tests/utils/test-utils';

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

async function searchFor(query: string) {
  render(<ClaimArtistSearch />);
  fireEvent.change(screen.getByTestId('claim-artist-search'), {
    target: { value: query },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  // The debounce has fired; the response body and the query result settle
  // over the following ticks.
  await screen.findByTestId('claim-artist-results');
}

describe('claim artist search rows', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(RESULTS)))
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows Claim as a real button on an unclaimed artist', async () => {
    await searchFor('artist');
    const row = screen.getAllByTestId('claim-artist-option')[0];
    expect(row).toHaveAttribute(
      'href',
      `${APP_ROUTES.CLAIM_START}?spotify=open-1`
    );
    const cta = screen.getByTestId('claim-artist-option-cta');
    expect(cta).toHaveTextContent('Claim');
    expect(cta.className).toBe(
      buttonVariants({ variant: 'secondary', size: 'sm' })
    );
  });

  it('sends the owner to their profile instead of offering Claim', async () => {
    await searchFor('artist');
    const owned = screen.getByTestId('claim-artist-owned');
    expect(owned).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(owned).toHaveTextContent('Open');
    expect(owned).not.toHaveTextContent('Claim');
  });

  it('keeps an artist claimed by someone else unclickable', async () => {
    await searchFor('artist');
    const taken = screen.getByTestId('claim-artist-claimed');
    expect(taken.tagName).not.toBe('A');
    expect(taken).toHaveTextContent('Claimed');
  });

  it('keeps the rows in place while a new search runs', async () => {
    await searchFor('artist');
    const before = screen.getByTestId('claim-artist-results');
    let respond!: (response: Response) => void;
    vi.mocked(globalThis.fetch).mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          respond = resolve;
        })
    );
    fireEvent.change(screen.getByTestId('claim-artist-search'), {
      target: { value: 'artists' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    // No status line is inserted above the rows; they dim where they are.
    expect(screen.queryByText('Searching…')).toBeNull();
    const list = screen.getByTestId('claim-artist-results');
    expect(list).toBe(before);
    expect(list.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(list.className).toContain('opacity-80');

    await act(async () => {
      respond(Response.json([{ ...RESULTS[0], name: 'Updated Artist' }]));
    });
    await screen.findByText('Updated Artist');
    expect(screen.getByTestId('claim-artist-results')).toBe(before);
    expect(list.parentElement).toHaveAttribute('aria-busy', 'false');
    expect(list.className).not.toContain('opacity-80');
  });

  it('says it is searching before the first results arrive', async () => {
    vi.mocked(globalThis.fetch).mockImplementation(
      () => new Promise<Response>(() => undefined)
    );
    render(<ClaimArtistSearch />);
    fireEvent.change(screen.getByTestId('claim-artist-search'), {
      target: { value: 'artist' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.getByText('Searching…').parentElement).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('clears stale rows and busy feedback when the query is cleared', async () => {
    await searchFor('artist');
    vi.mocked(globalThis.fetch).mockImplementation(
      () => new Promise<Response>(() => undefined)
    );
    fireEvent.change(screen.getByTestId('claim-artist-search'), {
      target: { value: 'artists' },
    });
    expect(
      screen.getByTestId('claim-artist-results').parentElement
    ).toHaveAttribute('aria-busy', 'true');
    fireEvent.change(screen.getByTestId('claim-artist-search'), {
      target: { value: '' },
    });
    await waitFor(() =>
      expect(screen.queryByTestId('claim-artist-results')).toBeNull()
    );
    expect(screen.queryByText('Searching…')).toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).toHaveAttribute(
      'aria-busy',
      'false'
    );
  });

  it('uses a readable avatar size', async () => {
    await searchFor('artist');
    const row = screen.getAllByTestId('claim-artist-option')[0];
    expect(row.querySelector('[data-size]')).toHaveAttribute('data-size', 'md');
  });
});
