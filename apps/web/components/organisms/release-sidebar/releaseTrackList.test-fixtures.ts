import type { ReleaseSidebarTrack } from '@/lib/discography/types';
import type { Release } from './types';

export const release: Release = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Midnight Echo',
  artistNames: ['Nova Rey'],
  status: 'released',
  slug: 'midnight-echo',
  smartLinkPath: '/r/midnight-echo',
  providers: [],
  releaseType: 'ep',
  isExplicit: false,
  totalTracks: 3,
  totalDiscs: 1,
};
export const track: ReleaseSidebarTrack = {
  id: 'track-1',
  releaseId: release.id,
  releaseSlug: release.slug,
  title: 'Static Skies',
  slug: 'static-skies',
  smartLinkPath: '/r/midnight-echo/static-skies',
  trackNumber: 1,
  discNumber: 1,
  durationMs: 185000,
  isrc: 'USRC17607839',
  isExplicit: false,
  previewUrl: 'https://example.com/preview.mp3',
  audioUrl: null,
  audioFormat: null,
  providers: [],
};
