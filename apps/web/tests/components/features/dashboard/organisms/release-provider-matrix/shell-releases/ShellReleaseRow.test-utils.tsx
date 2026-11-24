import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';

export const toggleTrack = vi.fn().mockResolvedValue(undefined);
export const fetchMock = vi.fn();

export const audioHarness = {
  playbackState: {
    activeTrackId: null as string | null,
    isPlaying: false,
    playbackStatus: 'idle' as
      | 'idle'
      | 'loading'
      | 'playing'
      | 'paused'
      | 'error',
  },
};

export function resetShellReleaseRowTestState() {
  toggleTrack.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  audioHarness.playbackState = {
    activeTrackId: null,
    isPlaying: false,
    playbackStatus: 'idle',
  };
}

/** Expose the Next Link contract without starting a router in jsdom. */
export const TestLink = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
>(function TestLink({ prefetch, ...props }, ref) {
  return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
});

export function fakeRelease(
  partial: Partial<ReleaseViewModel> & { id: string; title: string }
): ReleaseViewModel {
  return {
    profileId: 'p',
    artistNames: ['Bahamas'],
    status: 'released',
    artworkUrl: 'https://x.invalid/a.jpg',
    slug: partial.title.toLowerCase().replace(/\s+/g, '-'),
    smartLinkPath: `/${partial.title.toLowerCase().replace(/\s+/g, '-')}`,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...partial,
  } as ReleaseViewModel;
}
