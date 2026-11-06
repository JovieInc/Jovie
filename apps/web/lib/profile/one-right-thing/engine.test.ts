import { describe, expect, it } from 'vitest';
import {
  countPersonalizingRules,
  countryMatches,
  FEATURED_REASON_CODES,
  FEATURED_REASONS,
  type FeaturedInput,
  type FeaturedInventory,
  ONE_RIGHT_THING_CLAIM_GATE,
  pickOneRightThing,
  type VisitorSignals,
} from './engine';
import { neutralVisitorSignals } from './visitor-signals';

const NOW = new Date('2026-10-25T12:00:00Z');
const daysFrom = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const signals = (over: Partial<VisitorSignals> = {}): VisitorSignals => ({
  ...neutralVisitorSignals(NOW),
  ...over,
});

const inventory = (
  over: Partial<FeaturedInventory> = {}
): FeaturedInventory => ({
  release: { slug: 'song', releaseDate: daysFrom(-200), isUpcoming: false },
  shows: [],
  hasMerch: false,
  hasTip: false,
  hasListen: true,
  ...over,
});

const show = (id: string, inDays: number, country = 'US') => ({
  id,
  startDate: daysFrom(inDays),
  country,
  ticketUrl: 'https://tickets.example/x',
});

const pick = (over: {
  signals?: VisitorSignals;
  inv?: FeaturedInventory;
  artistPriority?: FeaturedInput['artistPriority'];
}) =>
  pickOneRightThing({
    signals: over.signals ?? signals(),
    inventory: over.inv ?? inventory(),
    artistPriority: over.artistPriority,
  });

const midRelease = {
  slug: 'mid',
  releaseDate: daysFrom(-60),
  isUpcoming: false,
};

describe('pickOneRightThing rules', () => {
  it('1 artist_pinned wins when the pinned kind is available', () => {
    const d = pick({
      artistPriority: 'merch',
      inv: inventory({ hasMerch: true, shows: [show('a', 3)] }),
      signals: signals({ country: 'US' }),
    });
    expect(d).toMatchObject({ kind: 'merch', reason: 'artist_pinned' });
  });

  it('1 artist_pinned is ignored when the pinned kind is unavailable', () => {
    const d = pick({ artistPriority: 'merch', inv: inventory() });
    expect(d?.reason).toBe('default_release');
  });

  it('2 release_upcoming_countdown leads over everything else', () => {
    const d = pick({
      inv: inventory({
        release: { slug: 'next', releaseDate: daysFrom(5), isUpcoming: true },
        shows: [show('a', 3)],
      }),
      signals: signals({ country: 'US' }),
    });
    expect(d).toMatchObject({
      kind: 'release',
      refId: 'next',
      reason: 'release_upcoming_countdown',
    });
  });

  it('3 show_in_visitor_country_soon needs a same-country show within 14 days', () => {
    const inv = inventory({ shows: [show('de', 5, 'Germany'), show('us', 6)] });
    expect(pick({ inv, signals: signals({ country: 'DE' }) })).toMatchObject({
      kind: 'show',
      refId: 'de',
      reason: 'show_in_visitor_country_soon',
    });
    expect(pick({ inv, signals: signals({ country: 'JP' }) })?.reason).not.toBe(
      'show_in_visitor_country_soon'
    );
    const far = inventory({ shows: [show('us', 20)] });
    expect(
      pick({ inv: far, signals: signals({ country: 'US' }) })?.reason
    ).not.toBe('show_in_visitor_country_soon');
  });

  it('3 beats the DSP rule: a show this week in their country is time critical', () => {
    const d = pick({
      inv: inventory({ shows: [show('us', 4)] }),
      signals: signals({
        country: 'US',
        source: { channel: 'dsp', name: 'spotify' },
      }),
    });
    expect(d?.reason).toBe('show_in_visitor_country_soon');
  });

  it('4 came_from_dsp_release features the release for DSP arrivals', () => {
    const d = pick({
      inv: inventory({ shows: [show('us', 40)] }),
      signals: signals({
        country: 'DE',
        source: { channel: 'dsp', name: 'spotify' },
      }),
    });
    expect(d).toMatchObject({
      kind: 'release',
      reason: 'came_from_dsp_release',
      context: { channel: 'dsp', source: 'spotify' },
    });
  });

  it('5 fresh_release leads for a release under 30 days old', () => {
    const d = pick({
      inv: inventory({
        release: { slug: 'new', releaseDate: daysFrom(-10), isUpcoming: false },
        shows: [show('us', 40)],
      }),
    });
    expect(d).toMatchObject({ kind: 'release', reason: 'fresh_release' });
  });

  it('6 returning_visitor_show needs returning === true and a show within 60 days', () => {
    const inv = inventory({ release: midRelease, shows: [show('us', 30)] });
    expect(pick({ inv, signals: signals({ returning: true }) })).toMatchObject({
      kind: 'show',
      reason: 'returning_visitor_show',
    });
    expect(pick({ inv, signals: signals({ returning: null }) })?.reason).toBe(
      'default_release'
    );
    expect(pick({ inv, signals: signals({ returning: false }) })?.reason).toBe(
      'default_release'
    );
  });

  it('7 show_in_visitor_country covers same-country shows within 60 days', () => {
    const d = pick({
      inv: inventory({ release: midRelease, shows: [show('gb', 45, 'GB')] }),
      signals: signals({ country: 'GB' }),
    });
    expect(d).toMatchObject({
      kind: 'show',
      reason: 'show_in_visitor_country',
    });
  });

  it('8 stale_release_show_soon features a show when the release is over 90 days old', () => {
    const d = pick({ inv: inventory({ shows: [show('fr', 50, 'FR')] }) });
    expect(d).toMatchObject({
      kind: 'show',
      refId: 'fr',
      reason: 'stale_release_show_soon',
    });
    const mid = inventory({
      release: midRelease,
      shows: [show('fr', 50, 'FR')],
    });
    expect(pick({ inv: mid })?.reason).toBe('default_release');
  });

  it('9 defaults follow release > show > merch > tip > listen', () => {
    const none: FeaturedInventory = {
      release: null,
      shows: [],
      hasMerch: false,
      hasTip: false,
      hasListen: false,
    };
    expect(pick({ inv: { ...none, shows: [show('a', 100)] } })?.reason).toBe(
      'default_show'
    );
    expect(
      pick({ inv: { ...none, hasMerch: true, hasTip: true } })?.reason
    ).toBe('default_merch');
    expect(
      pick({ inv: { ...none, hasTip: true, hasListen: true } })?.reason
    ).toBe('default_tip');
    expect(pick({ inv: { ...none, hasListen: true } })?.reason).toBe(
      'default_listen'
    );
    expect(pick({ inv: none })).toBeNull();
  });

  it('ignores past shows', () => {
    const d = pick({ inv: inventory({ shows: [show('past', -3)] }) });
    expect(d?.reason).toBe('default_release');
  });
});

describe('determinism and honesty', () => {
  it('returns identical decisions for identical input', () => {
    const input: FeaturedInput = {
      signals: signals({
        country: 'US',
        source: { channel: 'social', name: 'instagram' },
      }),
      inventory: inventory({ shows: [show('us', 20)] }),
    };
    expect(pickOneRightThing(input)).toEqual(pickOneRightThing(input));
  });

  it('records inApp and device in context but no rule reads them', () => {
    const base = signals({ country: 'US' });
    const inv = inventory({ shows: [show('us', 20)] });
    const a = pick({ inv, signals: base });
    const b = pick({
      inv,
      signals: { ...base, inApp: 'instagram', device: 'ios' },
    });
    expect(b?.kind).toBe(a?.kind);
    expect(b?.reason).toBe(a?.reason);
    expect(b?.context).toMatchObject({ inApp: 'instagram', device: 'ios' });
  });

  it('every decision over a wide input grid carries a registered reason code', () => {
    const sources = [
      { channel: 'direct', name: null },
      { channel: 'dsp', name: 'spotify' },
      { channel: 'social', name: 'instagram' },
    ] as const;
    const releases = [
      null,
      { slug: 'r', releaseDate: daysFrom(-5), isUpcoming: false },
      { slug: 'r', releaseDate: daysFrom(-300), isUpcoming: false },
      { slug: 'r', releaseDate: daysFrom(9), isUpcoming: true },
      { slug: 'r', releaseDate: null, isUpcoming: false },
    ];
    const showSets = [
      [],
      [show('s', 3)],
      [show('s', 40, 'DE')],
      [show('s', 200)],
    ];
    const pins = [null, 'merch', 'show', 'tip'] as const;
    let decisions = 0;
    for (const source of sources)
      for (const release of releases)
        for (const shows of showSets)
          for (const returning of [null, false, true])
            for (const country of [null, 'US', 'DE'])
              for (const merch of [false, true])
                for (const pin of pins) {
                  const d = pickOneRightThing({
                    signals: signals({ source, returning, country }),
                    inventory: inventory({
                      release,
                      shows,
                      hasMerch: merch,
                      hasListen: false,
                    }),
                    artistPriority: pin,
                  });
                  if (d) {
                    decisions += 1;
                    expect(FEATURED_REASON_CODES).toContain(d.reason);
                  }
                }
    expect(decisions).toBeGreaterThan(500);
  });

  it('has a dashboard label for every reason code', () => {
    for (const code of FEATURED_REASON_CODES) {
      expect(FEATURED_REASONS[code].label.length).toBeGreaterThan(10);
    }
  });

  it('counts at least the claim-gate minimum of personalizing rules', () => {
    expect(countPersonalizingRules()).toBeGreaterThanOrEqual(
      ONE_RIGHT_THING_CLAIM_GATE.minLiveRules
    );
  });
});

describe('countryMatches', () => {
  it('matches codes and English names, rejects junk', () => {
    expect(countryMatches('US', 'us')).toBe(true);
    expect(countryMatches('Germany', 'DE')).toBe(true);
    expect(countryMatches('United States', 'US')).toBe(true);
    expect(countryMatches('Germany', 'FR')).toBe(false);
    expect(countryMatches('', 'US')).toBe(false);
    expect(countryMatches('US', null)).toBe(false);
    expect(countryMatches('US', 'USA')).toBe(false);
  });
});
