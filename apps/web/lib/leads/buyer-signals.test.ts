import { describe, expect, it } from 'vitest';
import {
  BUYER_SIGNAL_WEIGHTS,
  PRESCREEN_PASS_SCORE,
  type PublicLinkPage,
  prescreenBuyer,
} from './buyer-signals';

// All fixtures are made up; no real artist pages.
const page = (overrides: Partial<PublicLinkPage> = {}): PublicLinkPage => ({
  handle: 'fixture_artist',
  displayName: 'Fixture Artist',
  bio: null,
  links: [{ url: 'https://open.spotify.com/artist/abc123' }],
  ...overrides,
});

describe('BUYER_SIGNAL_WEIGHTS', () => {
  it('pins the weights so a change shows up in review', () => {
    expect(BUYER_SIGNAL_WEIGHTS).toMatchInlineSnapshot(`
      {
        "bandcamp_direct": 10,
        "beehiiv": 10,
        "brand_deals": 5,
        "community": 25,
        "distrokid_hyperfollow": 5,
        "featurefm": 25,
        "found_ee": 20,
        "free_smart_link": 3,
        "hypeddit": 10,
        "kit": 15,
        "label_backing": 15,
        "laylo": 25,
        "link_in_bio_branding_removed": 10,
        "linkfire": 25,
        "mailchimp": 15,
        "merch_store": 10,
        "multi_dsp": 5,
        "paid_ads_pixel": 15,
        "patreon": 10,
        "release_cadence": 10,
        "shopify_store": 15,
        "show_co": 20,
        "smarturl": 15,
        "team_contact": 10,
        "toneden": 20,
        "touring": 15,
      }
    `);
    expect(PRESCREEN_PASS_SCORE).toBe(25);
  });
});

describe('prescreenBuyer', () => {
  it('passes an artist already paying for tools Jovie replaces, with reasons', () => {
    const result = prescreenBuyer(
      page({
        links: [
          { url: 'https://open.spotify.com/artist/abc123' },
          { url: 'https://ffm.to/new-single' },
          { url: 'https://laylo.com/fixture/drop' },
          { url: 'https://www.bandsintown.com/a/123' },
        ],
      })
    );
    expect(result.decision).toBe('pass');
    expect(result.replacedTools).toEqual(['featurefm', 'laylo']);
    expect(result.score).toBe(25 + 25 + 15);
    expect(result.reasons[0]).toBe('Feature.fm smart links (+25)');
    expect(result.signals.map(s => s.id)).toContain('touring');
  });

  it('fails a big page with no spend signal (reach is not a buyer)', () => {
    const result = prescreenBuyer(
      page({
        bio: '2M monthly listeners',
        links: [
          { url: 'https://open.spotify.com/artist/abc123' },
          { url: 'https://music.apple.com/us/artist/1' },
          { url: 'https://soundcloud.com/fixture' },
          { url: 'https://instagram.com/fixture' },
        ],
      })
    );
    expect(result.decision).toBe('fail');
    expect(result.hardStop).toBeNull();
    expect(result.reasons.at(-1)).toMatch(/no spend signal/);
  });

  it('passes on budget alone when the budget evidence is strong enough', () => {
    const result = prescreenBuyer(
      page({
        bio: 'Booking: agent@fixture-agency.test',
        links: [
          { url: 'https://open.spotify.com/artist/abc123' },
          { url: 'https://fixture-merch.myshopify.com' },
          { url: 'https://dice.fm/event/fixture' },
        ],
      })
    );
    expect(result.decision).toBe('pass');
    expect(result.replacedTools).toEqual([]);
    expect(result.signals.map(s => s.id).sort()).toEqual([
      'shopify_store',
      'team_contact',
      'touring',
    ]);
  });

  it('fails a budget signal that is too weak on its own', () => {
    const result = prescreenBuyer(
      page({
        links: [
          { url: 'https://open.spotify.com/artist/abc123' },
          { url: 'https://distrokid.com/hyperfollow/fixture/song' },
        ],
      })
    );
    expect(result.decision).toBe('fail');
  });

  it('reads tool domains out of free text such as a search snippet', () => {
    const result = prescreenBuyer(
      page({
        links: [],
        text: 'Fixture Artist | Linktree. New single out now ffm.to/fixture. Listen on open.spotify.com',
      })
    );
    expect(result.replacedTools).toEqual(['featurefm']);
    expect(result.decision).toBe('pass');
  });

  it('reads budget and music presence from link titles when there are no URLs', () => {
    const result = prescreenBuyer(
      page({
        links: [],
        text: 'Fixture Artist. Spotify. Apple Music. Tour dates. Official merch.',
      })
    );
    expect(result.hardStop).toBeNull();
    expect(result.signals.map(s => s.id)).toEqual(['touring', 'merch_store']);
    expect(result.decision).toBe('pass');
  });

  it('counts release cadence from distinct release links', () => {
    const result = prescreenBuyer(
      page({
        links: [
          { url: 'https://hypeddit.com/fixture/one' },
          { url: 'https://hypeddit.com/fixture/two' },
          { url: 'https://song.link/s/three' },
        ],
      })
    );
    const ids = result.signals.map(s => s.id);
    expect(ids).toContain('release_cadence');
    expect(result.score).toBe(10 + 10 + 3);
    expect(result.decision).toBe('fail');
  });

  it('records ads and branding observations only when the source reports them', () => {
    const withFlags = prescreenBuyer(
      page({ hasTrackingPixels: true, brandingRemoved: true })
    );
    expect(withFlags.signals.map(s => s.id).sort()).toEqual([
      'link_in_bio_branding_removed',
      'paid_ads_pixel',
    ]);
    expect(withFlags.decision).toBe('pass');
    const unknown = prescreenBuyer(page({ hasTrackingPixels: null }));
    expect(unknown.signals).toEqual([]);
  });

  it.each([
    [
      'excluded_identity',
      page({ handle: '@Founder_Page' }),
      { excludedHandles: ['founder_page'] },
    ],
    [
      'already_on_jovie',
      page({ links: [{ url: 'https://jov.ie/fixture' }] }),
      {},
    ],
    ['non_artist', page({ handle: 'fixturerecords' }), {}],
    [
      'no_music_presence',
      page({ links: [{ url: 'https://instagram.com/fixture' }] }),
      {},
    ],
  ] as const)('hard-stops %s before scoring', (stop, input, options) => {
    const result = prescreenBuyer(
      {
        ...input,
        links: [...input.links, { url: 'https://laylo.com/fixture' }],
      },
      options
    );
    // Even a strong tool footprint (a Laylo link) cannot buy past a stop.
    expect(result.hardStop).toBe(stop);
    expect(result.decision).toBe('fail');
    expect(result.score).toBe(0);
  });

  it.each([
    ['Bandcamp', 'https://fixture.bandcamp.com/album/one'],
    ['a Spotify short link', 'https://spoti.fi/3fixture'],
    ['a Spotify share link', 'https://spotify.link/fixture'],
  ])('counts a page linking only %s as a music presence', (_label, url) => {
    const result = prescreenBuyer(page({ links: [{ url }] }));
    expect(result.hardStop).toBeNull();
  });

  it('passes a Bandcamp-only artist with a paid tool', () => {
    const result = prescreenBuyer(
      page({
        links: [
          { url: 'https://fixture.bandcamp.com/' },
          { url: 'https://laylo.com/fixture' },
        ],
      })
    );
    expect(result.decision).toBe('pass');
  });

  it('counts each streaming service once, whatever the subdomain', () => {
    const result = prescreenBuyer(
      page({
        links: [
          { url: 'https://open.spotify.com/artist/abc123' },
          { url: 'https://artists.spotify.com/c/artist/abc123' },
          { url: 'https://on.soundcloud.com/fixture' },
          { url: 'https://soundcloud.com/fixture' },
          { url: 'https://m.youtube.com/@fixture' },
          { url: 'https://youtu.be/fixture' },
        ],
      })
    );
    const multi = result.signals.find(s => s.id === 'multi_dsp');
    expect(multi?.evidence).toBe('spotify,soundcloud,youtube');
    const twoServices = prescreenBuyer(
      page({
        links: [
          { url: 'https://open.spotify.com/artist/abc123' },
          { url: 'https://artists.spotify.com/c/artist/abc123' },
          { url: 'https://m.youtube.com/@fixture' },
          { url: 'https://youtu.be/fixture' },
        ],
      })
    );
    expect(twoServices.signals.map(s => s.id)).not.toContain('multi_dsp');
  });

  it.each([
    ['a PR firm', 'Music PR campaigns for indie artists'],
    ['an artist network', 'An underground artist network since 1994'],
  ])('hard-stops %s that links many releases', (_label, bio) => {
    const result = prescreenBuyer(
      page({
        handle: 'fixture_service',
        bio,
        links: [
          { url: 'https://lnk.to/one' },
          { url: 'https://lnk.to/two' },
          { url: 'https://ffm.to/three' },
        ],
      })
    );
    expect(result.hardStop).toBe('non_artist');
  });

  it('keeps a DJ who also calls themself a curator', () => {
    const result = prescreenBuyer(
      page({
        displayName: 'Curator, DJ, producer',
        links: [
          { url: 'https://fixture.bandcamp.com/' },
          { url: 'https://laylo.com/fixture' },
        ],
      })
    );
    expect(result.hardStop).toBeNull();
    expect(prescreenBuyer(page({ handle: 'fixturecurator' })).hardStop).toBe(
      'non_artist'
    );
  });

  it('treats a missing streaming link as unknown on a partial view', () => {
    const snippet = page({ links: [], text: 'Fixture | Linktree ffm.to/x' });
    expect(prescreenBuyer(snippet).decision).toBe('pass');
    const titleOnly = page({ links: [], text: 'Fixture | Linktree laylo.com' });
    expect(prescreenBuyer(titleOnly).hardStop).toBe('no_music_presence');
    expect(prescreenBuyer(titleOnly, { pageSeenInFull: false }).decision).toBe(
      'pass'
    );
  });

  it('ignores lookalike hosts', () => {
    const result = prescreenBuyer(
      page({ links: [{ url: 'https://notffm.to.example.test/x' }] })
    );
    expect(result.replacedTools).toEqual([]);
  });
});
