import { describe, expect, it } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { buildLibraryReleaseAssets } from './library-data';
import { groupLibraryDependencies } from './library-hierarchy';

const release: ReleaseViewModel = {
  profileId: 'p',
  id: 'album',
  title: 'Album',
  artistNames: ['Artist'],
  status: 'released',
  slug: 'album',
  smartLinkPath: '/artist/album',
  providers: [],
  releaseType: 'album',
  isExplicit: false,
  totalTracks: 2,
};
const parent = buildLibraryReleaseAssets([release])[0];
const video = {
  ...parent,
  id: 'video',
  title: 'Video',
  itemKind: 'video' as const,
  linkedReleaseId: 'album',
};

describe('stored Library dependencies', () => {
  it('keeps visible children beside their album, preserving sibling order and the final guide', () => {
    const second = { ...video, id: 'video-2' };
    const unrelated = { ...parent, id: 'another-album', title: 'Unrelated' };
    const grouped = groupLibraryDependencies([
      video,
      unrelated,
      parent,
      second,
    ]);
    expect(grouped.rows.map(row => row.id)).toEqual([
      'another-album',
      'album',
      'video',
      'video-2',
    ]);
    expect(grouped.dependencies.get('video')).toEqual({
      parentTitle: 'Album',
      last: false,
    });
    expect(grouped.dependencies.get('video-2')).toEqual({
      parentTitle: 'Album',
      last: true,
    });
    expect(grouped.dependencies.has('another-album')).toBe(false);
  });
  it('leaves a filtered child readable without fabricating a hidden parent', () => {
    const grouped = groupLibraryDependencies([video]);
    expect(grouped.rows).toEqual([video]);
    expect(grouped.dependencies.size).toBe(0);
  });
  it('rejects self-links and release-to-release links instead of inventing dependency semantics', () => {
    const self = { ...video, linkedReleaseId: 'video' };
    const releaseChild = {
      ...parent,
      id: 'release-child',
      linkedReleaseId: 'album',
    };
    const grouped = groupLibraryDependencies([self, parent, releaseChild]);
    expect(grouped.rows).toEqual([self, parent, releaseChild]);
    expect(grouped.dependencies.size).toBe(0);
  });
});
