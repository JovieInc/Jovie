import { describe, expect, it } from 'vitest';
import {
  canonicalPublicLinkUrl,
  observePublicLinkPage,
  qualifyObservedPublicLink,
  readObservedPublicPage,
} from './public-link-observation';
import {
  parseLayloProfile,
  parseLinktreeAccount,
  parseSmartLinkHtml,
} from './public-link-page-parsers';

const OBSERVED_AT = '2026-11-19T00:00:00.000Z';

function page(overrides: Parameters<typeof observePublicLinkPage>[0]) {
  const observed = observePublicLinkPage({
    observedAt: OBSERVED_AT,
    links: [],
    ...overrides,
  });
  if (!observed) throw new Error(`fixture rejected: ${overrides.url}`);
  return observed;
}

describe('public link observation', () => {
  it('canonicalizes a public smart-link URL and ignores other hosts', () => {
    expect(
      canonicalPublicLinkUrl('https://FFM.to/Northline/?utm_source=ig#top')
    ).toBe('https://ffm.to/northline');
    expect(canonicalPublicLinkUrl('https://open.spotify.com/artist/x')).toBe(
      null
    );
  });

  it('qualifies a Feature.fm page that links Spotify', () => {
    const decision = qualifyObservedPublicLink(
      page({
        url: 'https://ffm.to/northline',
        displayName: 'Northline',
        bio: 'DJ and producer. Reach northline@example.com',
        links: [
          { url: 'https://open.spotify.com/artist/northlinefixture' },
          { url: 'https://instagram.com/northline' },
        ],
      })
    );

    expect(decision.outcome).toBe('qualified');
    expect(decision.bio).toBe('DJ and producer. Reach');
    expect(decision.musicToolsDetected).toContain('featurefm');
    expect(decision.hasSpotifyLink).toBe(true);
    expect(decision.hasRepresentation).toBe(false);
    expect(decision.fitScoreBreakdown).toMatchObject({
      scorer: 'buyer_prescreen',
      source: 'public_page',
      platform: 'featurefm',
    });
  });

  it('disqualifies a contest page that would otherwise pass', () => {
    const decision = qualifyObservedPublicLink(
      page({
        url: 'https://ffm.to/win-a-copy',
        displayName: 'Enter to win a copy of the single',
        links: [{ url: 'https://open.spotify.com/artist/contestfixture' }],
      })
    );

    expect(decision.outcome).toBe('disqualified');
    expect(decision.disqualificationReason).toBe('contest_or_giveaway');
  });

  it('keeps a relationship hold in the qualified list and tags it', () => {
    const decision = qualifyObservedPublicLink(
      page({
        url: 'https://linktr.ee/djdannic',
        displayName: 'Dannic',
        bio: 'DJ',
        links: [
          { url: 'https://ffm.to/dannic-single' },
          { url: 'https://open.spotify.com/artist/dannicfixture' },
        ],
      })
    );

    expect(decision.outcome).toBe('qualified');
    expect(decision.hasRepresentation).toBe(true);
    expect(decision.representationSignal).toMatch(/Dannic/i);
  });

  it('tags an Armada note without treating it as a hold', () => {
    const decision = qualifyObservedPublicLink(
      page({
        url: 'https://laylo.com/northline',
        displayName: 'Northline',
        bio: 'Out now on Armada',
        links: [{ url: 'https://open.spotify.com/artist/northlinefixture' }],
      })
    );

    expect(decision.outcome).toBe('qualified');
    expect(decision.hasRepresentation).toBe(false);
    expect(decision.representationSignal).toMatch(/Armada/);
    expect(decision.sourcePlatform).toBe('laylo');
  });

  it('excludes the founder handle', () => {
    const decision = qualifyObservedPublicLink(
      page({
        url: 'https://linktr.ee/timwhite',
        displayName: 'Tim',
        links: [
          { url: 'https://ffm.to/release' },
          { url: 'https://open.spotify.com/artist/founderfixture' },
        ],
      })
    );

    expect(decision.outcome).toBe('disqualified');
    expect(decision.disqualificationReason).toBe('excluded_identity');
  });

  it('rejects a Laylo page with no streaming link', () => {
    const decision = qualifyObservedPublicLink(
      page({
        url: 'https://laylo.com/honeybanks',
        displayName: 'Honey Banks',
        bio: 'Get notified about exclusive content, merch, and event drops',
      })
    );

    expect(decision.outcome).toBe('disqualified');
    expect(decision.disqualificationReason).toBe('no_music_presence');
  });

  it('reads a stored public page and ignores a search-only snapshot', () => {
    const stored = page({
      url: 'https://lnk.to/northline',
      displayName: 'Northline',
      links: [{ url: 'https://open.spotify.com/artist/northlinefixture' }],
    });

    expect(
      readObservedPublicPage({
        publicPage: { ...stored, links: [...stored.links] },
      })?.url
    ).toBe('https://lnk.to/northline');
    expect(readObservedPublicPage({ publicPage: { source: 'other' } })).toBe(
      null
    );
  });
});

describe('public link page parsers', () => {
  it('uses the Linktree account payload and not page chrome', () => {
    const observed = parseLinktreeAccount(
      {
        username: 'northline',
        pageTitle: 'Northline',
        description: 'DJ and producer',
        links: [
          {
            url: 'https://open.spotify.com/artist/northlinefixture',
            title: 'Listen',
          },
        ],
        socialLinks: [
          { url: 'https://instagram.com/northline', type: 'instagram' },
        ],
        facebookPixelId: '123',
        ownedBy: { id: 'do-not-store' },
      },
      'https://linktr.ee/northline',
      OBSERVED_AT
    );

    expect(observed?.handle).toBe('northline');
    expect(observed?.links.map(link => link.url)).toEqual([
      'https://linktr.ee/northline',
      'https://open.spotify.com/artist/northlinefixture',
      'https://instagram.com/northline',
    ]);
    expect(observed?.hasTrackingPixels).toBe(true);
    expect(JSON.stringify(observed)).not.toContain('do-not-store');
  });

  it('uses the Laylo user username and drops contact fields', () => {
    const observed = parseLayloProfile(
      {
        title: 'wrong-title',
        description: 'DJ sets',
        user: { id: 'user-1', username: 'northline' },
      },
      {
        username: 'northline',
        displayName: 'Northline',
        spotify: 'https://open.spotify.com/artist/northlinefixture',
        whatsappPhone: '+15555550100',
      },
      'https://laylo.com/other',
      OBSERVED_AT
    );

    expect(observed?.url).toBe('https://laylo.com/northline');
    expect(observed?.links.map(link => link.url)).toContain(
      'https://open.spotify.com/artist/northlinefixture'
    );
    expect(JSON.stringify(observed)).not.toContain('15555550100');
  });

  it('reads a smart-link title and https hrefs', () => {
    const observed = parseSmartLinkHtml(
      '<html><title>Northline &amp; Co &#039;Live&#039;</title><a href="https://ib.adnxs.com/pixel">ad</a><a href="mailto:a@example.com">mail</a><a href="https://open.spotify.com/artist/northlinefixture?si=1&amp;utm=2">play</a></html>',
      'https://lnk.to/northline',
      OBSERVED_AT
    );

    expect(observed?.displayName).toBe("Northline & Co 'Live'");
    expect(observed?.platform).toBe('linkfire');
    expect(observed?.links.map(link => link.url)).toEqual([
      'https://lnk.to/northline',
      'https://open.spotify.com/artist/northlinefixture?si=1&utm=2',
    ]);
  });
});
