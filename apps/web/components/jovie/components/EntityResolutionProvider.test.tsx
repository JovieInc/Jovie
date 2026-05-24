import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook } from '@testing-library/react';
import { type ReactElement, type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries';
import type { EventRecord } from '@/lib/queries/useEventsQuery';
import {
  EntityResolutionProvider,
  NULL_ENTITY_RESOLUTION,
  useEntityResolution,
} from './EntityResolutionProvider';

function makeRelease(
  id: string,
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'p1',
    id,
    title: `Release ${id}`,
    artworkUrl: 'https://example.com/cover.jpg',
    artistNames: ['Tim'],
    releaseDate: '2026-03-14',
    status: 'released',
    slug: id,
    smartLinkPath: `/r/${id}`,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...overrides,
  } as ReleaseViewModel;
}

function makeEvent(id: string): EventRecord {
  return {
    id,
    title: `Event ${id}`,
    subtitle: 'Brooklyn, NY · Bandsintown',
    eventDate: '2026-06-01T20:00:00Z',
    timezone: 'America/New_York',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    providerKey: 'bandsintown',
    reviewedAt: null,
    lastSyncedAt: null,
    venue: 'Sunset',
    city: 'Brooklyn',
    provider: 'Bandsintown',
  };
}

function wrapperWithClient(
  client: QueryClient,
  profileId: string | null
): (p: { readonly children: ReactNode }) => ReactElement {
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={client}>
        <EntityResolutionProvider profileId={profileId}>
          {children}
        </EntityResolutionProvider>
      </QueryClientProvider>
    );
  };
}

function CacheWriter({
  client,
}: Readonly<{ client: QueryClient }>): ReactElement | null {
  useState(() => {
    client.setQueryData(queryKeys.releases.matrix('p1'), [
      makeRelease('rel_sync'),
    ]);
    return null;
  });
  return null;
}

describe('EntityResolutionProvider', () => {
  it('returns NULL_ENTITY_RESOLUTION when no provider is mounted', () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useEntityResolution('release', 'r1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    expect(result.current).toEqual(NULL_ENTITY_RESOLUTION);
  });

  it('returns NULL when profileId is null/undefined', () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useEntityResolution('release', 'r1'), {
      wrapper: wrapperWithClient(client, null),
    });
    expect(result.current.ref).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('does NOT trigger a fetch — fetchQuery is never called', () => {
    const client = new QueryClient();
    const fetchSpy = vi.spyOn(client, 'fetchQuery');
    renderHook(() => useEntityResolution('release', 'r1'), {
      wrapper: wrapperWithClient(client, 'p1'),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves a release from cached matrix data', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.releases.matrix('p1'), [
      makeRelease('rel_1', { title: 'Sober' }),
    ]);
    const { result } = renderHook(
      () => useEntityResolution('release', 'rel_1'),
      { wrapper: wrapperWithClient(client, 'p1') }
    );
    expect(result.current.ref?.label).toBe('Sober');
    expect(result.current.ref?.thumbnail).toBe('https://example.com/cover.jpg');
    expect(result.current.ref?.meta?.kind).toBe('release');
  });

  it('refreshes release chips when the cached matrix key updates', async () => {
    const client = new QueryClient();
    const { result } = renderHook(
      () => useEntityResolution('release', 'rel_later'),
      { wrapper: wrapperWithClient(client, 'p1') }
    );

    expect(result.current.ref).toBeUndefined();

    await act(async () => {
      client.setQueryData(queryKeys.releases.matrix('p1'), [
        makeRelease('rel_later', { title: 'Late Arrival' }),
      ]);
      await Promise.resolve();
    });

    expect(result.current.ref?.label).toBe('Late Arrival');
  });

  it('ignores unrelated release detail cache updates', async () => {
    const client = new QueryClient();
    let renderCount = 0;
    renderHook(
      () => {
        renderCount += 1;
        return useEntityResolution('release', 'rel_detail');
      },
      { wrapper: wrapperWithClient(client, 'p1') }
    );

    await act(async () => {
      client.setQueryData(queryKeys.releases.detail('p1', 'rel_detail'), {
        id: 'rel_detail',
      });
      await Promise.resolve();
    });

    expect(renderCount).toBe(1);
  });

  it('ignores entity cache updates for other profiles', async () => {
    const client = new QueryClient();
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount += 1;
        return useEntityResolution('release', 'rel_other_profile');
      },
      { wrapper: wrapperWithClient(client, 'p1') }
    );

    await act(async () => {
      client.setQueryData(queryKeys.releases.matrix('p2'), [
        makeRelease('rel_other_profile', { title: 'Wrong profile' }),
      ]);
      client.setQueryData(queryKeys.events.list('p2'), [makeEvent('evt_p2')]);
      await Promise.resolve();
    });

    expect(result.current.ref).toBeUndefined();
    expect(renderCount).toBe(1);
  });

  it('defers cache notifications that happen during child render', async () => {
    const client = new QueryClient();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <QueryClientProvider client={client}>
        <EntityResolutionProvider profileId='p1'>
          <CacheWriter client={client} />
        </EntityResolutionProvider>
      </QueryClientProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      errorSpy.mock.calls.some(args =>
        String(args[0]).includes('Cannot update a component')
      )
    ).toBe(false);
    errorSpy.mockRestore();
  });

  it('returns undefined when release id is not in the cache', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.releases.matrix('p1'), [
      makeRelease('rel_1'),
    ]);
    const { result } = renderHook(
      () => useEntityResolution('release', 'rel_missing'),
      { wrapper: wrapperWithClient(client, 'p1') }
    );
    expect(result.current.ref).toBeUndefined();
  });

  it('resolves an event from cached events list', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.events.list('p1'), [makeEvent('evt_1')]);
    const { result } = renderHook(() => useEntityResolution('event', 'evt_1'), {
      wrapper: wrapperWithClient(client, 'p1'),
    });
    expect(result.current.ref?.label).toBe('Event evt_1');
    expect(result.current.ref?.meta?.kind).toBe('event');
  });

  it('returns undefined for artist (no profile-scoped cache)', () => {
    const client = new QueryClient();
    const { result } = renderHook(
      () => useEntityResolution('artist', 'art_1'),
      { wrapper: wrapperWithClient(client, 'p1') }
    );
    expect(result.current.ref).toBeUndefined();
  });

  it('returns undefined for track (no query hook yet)', () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useEntityResolution('track', 'trk_1'), {
      wrapper: wrapperWithClient(client, 'p1'),
    });
    expect(result.current.ref).toBeUndefined();
  });
});
