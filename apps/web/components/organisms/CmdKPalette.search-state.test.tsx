import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFlagProvider } from '@/lib/flags/client';
import type { UseArtistSearchQueryReturn } from '@/lib/queries/useArtistSearchQuery';
import { CmdKPalette } from './CmdKPalette';

const mocks = vi.hoisted(() => ({
  useRealArtistHook: false,
  fetch: vi.fn(),
  artist: {
    results: [],
    state: 'idle',
    error: null,
    query: '',
    isPending: false,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
  } satisfies UseArtistSearchQueryReturn as UseArtistSearchQueryReturn,
  releases: {
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => mocks.releases,
}));
vi.mock('@/lib/queries/useArtistSearchQuery', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/queries/useArtistSearchQuery')>();
  return {
    ...actual,
    useArtistSearchQuery: (
      ...args: Parameters<typeof actual.useArtistSearchQuery>
    ) =>
      mocks.useRealArtistHook
        ? actual.useArtistSearchQuery(...args)
        : mocks.artist,
  };
});
vi.mock('@/lib/queries/fetch', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries/fetch')>()),
  fetchWithTimeout: mocks.fetch,
}));
vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({ data: undefined }),
}));

const queryClient = new QueryClient();

function palette(open = true) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppFlagProvider flags={{}}>
        <CmdKPalette profileId='profile-1' open={open} onOpenChange={vi.fn()} />
      </AppFlagProvider>
    </QueryClientProvider>
  );
}

function search(query = 'qa-unfindable-6506') {
  if (!mocks.useRealArtistHook) mocks.artist.query = query;
  fireEvent.change(screen.getByRole('combobox'), { target: { value: query } });
}

describe('Cmd-K search feedback and recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useRealArtistHook = false;
    queryClient.clear();
    Object.assign(mocks.artist, {
      results: [],
      state: 'idle',
      error: null,
      query: '',
      isPending: false,
    });
    Object.assign(mocks.releases, {
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
    });
  });

  it.each(['loading', 'debouncing'] as const)(
    'does not announce no matches while artists are %s',
    phase => {
      mocks.artist.state = phase === 'loading' ? 'loading' : 'idle';
      mocks.artist.isPending = phase === 'debouncing';
      render(palette());
      search();
      expect(screen.getByRole('status')).toHaveTextContent('Searching');
      expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
    }
  );

  it('keeps local routes usable while release data loads', () => {
    mocks.releases.isLoading = true;
    render(palette());
    search('Work');
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('shows a recoverable artist failure without replacing matching local routes', () => {
    mocks.artist.state = 'error';
    render(palette());
    search('Work');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Search' }));
    expect(mocks.artist.searchImmediate).toHaveBeenCalledExactlyOnceWith(
      'Work'
    );
    expect(mocks.releases.refetch).not.toHaveBeenCalled();
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });

  it('returns keyboard focus to search before the retry control disappears', async () => {
    mocks.artist.state = 'error';
    const { rerender } = render(palette());
    search();
    const retry = screen.getByRole('button', { name: 'Retry Search' });
    retry.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(mocks.artist.searchImmediate).toHaveBeenCalledOnce();
    expect(screen.getByRole('combobox')).toHaveFocus();
    mocks.artist.state = 'empty';
    rerender(palette());
    expect(
      screen.queryByRole('button', { name: 'Retry Search' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('does not flash no matches across a real debounced query transition', async () => {
    mocks.useRealArtistHook = true;
    mocks.fetch.mockResolvedValue([]);
    render(palette());
    search('zz-absent-first-query');
    await waitFor(() => expect(screen.getByText('No matches.')).toBeVisible());
    search('zz-absent-next-query');
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        '/api/spotify/search?q=zz-absent-next-query&limit=8',
        expect.any(Object)
      )
    );
    await waitFor(() => expect(screen.getByText('No matches.')).toBeVisible());
  });

  it('retries both failed sources with the current input, without clearing it', () => {
    mocks.releases.isError = true;
    mocks.artist.state = 'error';
    render(palette());
    search();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Search' }));
    expect(mocks.releases.refetch).toHaveBeenCalledOnce();
    expect(mocks.artist.searchImmediate).toHaveBeenCalledExactlyOnceWith(
      'qa-unfindable-6506'
    );
    expect(screen.getByRole('combobox')).toHaveValue('qa-unfindable-6506');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Some results could not load.'
    );
  });

  it('prevents repeated retry while a failed source is already fetching', () => {
    mocks.releases.isError = true;
    mocks.releases.isFetching = true;
    render(palette());
    search();
    expect(screen.getByRole('button', { name: 'Retry Search' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Search' }));
    expect(mocks.releases.refetch).not.toHaveBeenCalled();
  });

  it('announces no matches only after the sources settle successfully', () => {
    mocks.artist.state = 'empty';
    const { rerender } = render(palette());
    search();
    expect(screen.getByText('No matches.')).toBeVisible();
    mocks.releases.isFetching = true;
    rerender(palette());
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
    mocks.releases.isFetching = false;
    rerender(palette());
    expect(screen.getByText('No matches.')).toBeVisible();
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'false');
  });

  it('clears pending search when closed and starts with an empty field on reopen', () => {
    mocks.artist.isPending = true;
    const { rerender } = render(palette());
    search();
    rerender(palette(false));
    expect(mocks.artist.clear).toHaveBeenCalledOnce();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    mocks.artist.isPending = false;
    rerender(palette());
    expect(screen.getByRole('combobox')).toHaveValue('');
  });
});
