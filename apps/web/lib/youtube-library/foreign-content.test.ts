import { describe, expect, it } from 'vitest';
import type { ChannelSurfaceVideo } from './foreign-content';
import { detectForeignContent } from './foreign-content';

const OWN = 'UC90tJdD38139ytPUdEZVl1A';
const VEVO = 'UCvP_6uenaAVETmO1FRJ25NA';
const STRANGER = 'UCstrangerChannel123';

function video(partial: Partial<ChannelSurfaceVideo>): ChannelSurfaceVideo {
  return {
    videoId: 'vid',
    owningChannelId: OWN,
    owningChannelTitle: 'Tim White',
    title: 'A video',
    ...partial,
  };
}

describe('detectForeignContent', () => {
  it('ignores ordinary uploads on owned channels', () => {
    expect(
      detectForeignContent({
        ownedChannelIds: [OWN],
        surfaceVideos: [video({ videoId: 'a' })],
      })
    ).toEqual([]);
  });

  it('exempts verified-catalog videos even when surfaced by a linked channel', () => {
    // The misdelivery-on-legacy-channel case: channel-level exclusion would
    // flag every catalog upload on the legacy VEVO channel; release-level
    // classification against the verified catalog must not.
    expect(
      detectForeignContent({
        ownedChannelIds: [OWN],
        linkedChannelIds: [VEVO],
        verifiedCatalogVideoIds: ['zvl1IlM2fEU'],
        surfaceVideos: [
          video({
            videoId: 'zvl1IlM2fEU',
            owningChannelId: VEVO,
            owningChannelTitle: 'TimWhiteVEVO',
            title: 'Tim White - This Is Love',
          }),
        ],
      })
    ).toEqual([]);
  });

  it('flags a non-catalog upload on a linked channel for owner review', () => {
    const cases = detectForeignContent({
      ownedChannelIds: [OWN],
      linkedChannelIds: [VEVO],
      verifiedCatalogVideoIds: ['zvl1IlM2fEU'],
      surfaceVideos: [
        video({
          videoId: 'HKJoClnIabU',
          owningChannelId: VEVO,
          owningChannelTitle: 'TimWhiteVEVO',
          title: 'Tim White - Pray On My Child',
        }),
      ],
    });
    expect(cases).toHaveLength(1);
    expect(cases[0].classification).toBe('foreign_upload_on_linked_channel');
    expect(cases[0].status).toBe('needs_owner_review');
    expect(cases[0].caseKey).toBe(`${VEVO}:HKJoClnIabU`);
  });

  it('requires owner review when catalog and channel lists are incomplete', () => {
    const cases = detectForeignContent({
      ownedChannelIds: [OWN],
      linkedChannelIds: [VEVO],
      surfaceVideos: [
        video({
          videoId: 'foreign1',
          owningChannelId: STRANGER,
          owningChannelTitle: 'Somebody Else',
        }),
      ],
    });
    expect(cases[0].classification).toBe('wrong_release_attribution');
    expect(cases[0].status).toBe('needs_owner_review');
  });

  it('classifies artist-flagged owned uploads as owned_unwanted', () => {
    const cases = detectForeignContent({
      ownedChannelIds: [OWN],
      flaggedForeignVideoIds: ['mine-but-bad'],
      surfaceVideos: [video({ videoId: 'mine-but-bad' })],
    });
    expect(cases[0].classification).toBe('owned_unwanted');
    expect(cases[0].status).toBe('needs_owner_review');
  });

  it('dedupes repeated surface entries to one case per owning channel + video', () => {
    const dup = video({ videoId: 'dup', owningChannelId: STRANGER });
    const cases = detectForeignContent({
      ownedChannelIds: [OWN],
      surfaceVideos: [dup, dup, dup],
    });
    expect(cases).toHaveLength(1);
  });

  it('skips rows missing a video id or owning channel id', () => {
    const cases = detectForeignContent({
      ownedChannelIds: [OWN],
      surfaceVideos: [
        video({ videoId: '', owningChannelId: STRANGER }),
        video({ videoId: 'ok', owningChannelId: '' }),
      ],
    });
    expect(cases).toEqual([]);
  });
});

describe('catalog safety', () => {
  it('preserves verified catalog videos across owned, linked, and unknown channels', () => {
    expect(
      detectForeignContent({
        ownedChannelIds: [OWN],
        linkedChannelIds: [VEVO],
        verifiedCatalogVideoIds: ['a', 'b', 'c'],
        surfaceVideos: [
          video({ videoId: 'a' }),
          video({ videoId: 'b', owningChannelId: VEVO }),
          video({ videoId: 'c', owningChannelId: STRANGER }),
        ],
      })
    ).toEqual([]);
  });
  it('surfaces conflicting owner flags without silently excluding verified videos', () => {
    for (const owningChannelId of [OWN, VEVO, STRANGER]) {
      const [result] = detectForeignContent({
        ownedChannelIds: [OWN],
        linkedChannelIds: [VEVO],
        verifiedCatalogVideoIds: ['conflict'],
        flaggedForeignVideoIds: ['conflict'],
        surfaceVideos: [
          video({
            videoId: 'conflict',
            owningChannelId,
            owningChannelTitle: null,
          }),
        ],
      });
      expect(result.status).toBe('needs_owner_review');
      expect(result.catalogConflict).toBe(true);
      expect(result.evidence).toContain('conflicts with verified catalog');
      expect(result.evidence).toContain(owningChannelId);
    }
  });
  it('reviews only the unverified video in a mixed linked-channel catalog', () => {
    const results = detectForeignContent({
      ownedChannelIds: [OWN],
      linkedChannelIds: [VEVO],
      verifiedCatalogVideoIds: ['real'],
      surfaceVideos: [
        video({ videoId: 'real', owningChannelId: VEVO }),
        video({ videoId: 'review', owningChannelId: VEVO }),
      ],
    });
    expect(results.map(result => result.videoId)).toEqual(['review']);
    expect(results[0].catalogConflict).toBe(false);
  });
});
