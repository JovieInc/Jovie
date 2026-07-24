import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CREATE_PAGE_KIND,
  buildAuthorityCreatePagePayload,
  buildAuthorityCreatePagePayloads,
  detectAuthorityPageGaps,
  surfaceCoversAuthorityPlatform,
} from './authority-page-gap-detector';

const BASE_INPUT = {
  userId: 'user-1',
  creatorProfileId: 'profile-1',
  artistName: 'Tim White',
  jovieUsername: 'tim',
  existingSurfaces: [] as { platform: string; url?: string | null }[],
  unlinkedMentions: [
    {
      peerName: 'Cosmic Gate',
      peerPageUrl: 'https://edm.fandom.com/wiki/Cosmic_Gate',
      artistNameAsMentioned: 'Tim White',
      platform: 'fandom' as const,
    },
  ],
  graphContext: {
    collabs: [
      {
        name: 'Cosmic Gate',
        context: 'Associated artists',
        unlinkedMention: true,
        sourceUrl: 'https://edm.fandom.com/wiki/Cosmic_Gate',
      },
    ],
  },
};

describe('authority page gap detector (GH #14651)', () => {
  it('detects fandom/genius/wikipedia gaps when no surfaces exist', () => {
    const gaps = detectAuthorityPageGaps(BASE_INPUT);
    expect(gaps.map(g => g.platform)).toEqual([
      'fandom',
      'genius',
      'wikipedia',
    ]);
    expect(gaps[0].evidence[0]?.peerName).toBe('Cosmic Gate');
    expect(gaps[2].publishGate).toBe('human_only');
  });

  it('skips platforms already covered by profile surfaces', () => {
    const gaps = detectAuthorityPageGaps({
      ...BASE_INPUT,
      existingSurfaces: [
        { platform: 'genius', url: 'https://genius.com/artists/Tim-white' },
        {
          platform: 'wikipedia',
          url: 'https://en.wikipedia.org/wiki/Tim_White_(musician)',
        },
      ],
    });
    expect(gaps.map(g => g.platform)).toEqual(['fandom']);
  });

  it('treats fandom.com URLs as covering the fandom platform', () => {
    expect(
      surfaceCoversAuthorityPlatform(
        {
          platform: 'website',
          url: 'https://edm.fandom.com/wiki/Tim_White',
        },
        'fandom'
      )
    ).toBe(true);
  });

  it('does not treat Wikidata alone as a Wikipedia page', () => {
    expect(
      surfaceCoversAuthorityPlatform(
        {
          platform: 'wikidata',
          url: 'https://www.wikidata.org/wiki/Q42',
        },
        'wikipedia'
      )
    ).toBe(false);
  });

  it('builds opportunity payload with draft CTA and graph context', () => {
    const gaps = detectAuthorityPageGaps(BASE_INPUT);
    const fandomGap = gaps.find(g => g.platform === 'fandom');
    expect(fandomGap).toBeDefined();
    const payload = buildAuthorityCreatePagePayload(BASE_INPUT, fandomGap!);

    expect(payload.playbook).toBe(AUTHORITY_CREATE_PAGE_KIND);
    expect(payload.title).toContain('Tim White');
    expect(payload.primaryActionLabel).toBe('Draft page');
    expect(payload.humanGateRequired).toBe(false);
    expect(payload.why).toContain('Cosmic Gate');
    expect(payload.graphContext.artistName).toBe('Tim White');
    expect(payload.graphContext.collabs?.[0]?.name).toBe('Cosmic Gate');
  });

  it('uses Review draft CTA for Wikipedia human gate', () => {
    const gaps = detectAuthorityPageGaps(BASE_INPUT);
    const wikiGap = gaps.find(g => g.platform === 'wikipedia');
    const payload = buildAuthorityCreatePagePayload(BASE_INPUT, wikiGap!);
    expect(payload.primaryActionLabel).toBe('Review draft');
    expect(payload.humanGateRequired).toBe(true);
  });

  it('returns no payloads when all authority pages exist', () => {
    const payloads = buildAuthorityCreatePagePayloads({
      ...BASE_INPUT,
      existingSurfaces: [
        { platform: 'fandom', url: 'https://edm.fandom.com/wiki/Tim_White' },
        { platform: 'genius', url: 'https://genius.com/artists/Tim-white' },
        {
          platform: 'wikipedia',
          url: 'https://en.wikipedia.org/wiki/Tim_White',
        },
      ],
    });
    expect(payloads).toEqual([]);
  });
});
