import { describe, expect, it } from 'vitest';
import {
  checkConsentCard,
  checkCookieCardFold,
  checkEmptyEventsTab,
  checkHeroNotCropped,
  checkNoStuckLoader,
  checkOgImageContentType,
  checkOgQuality,
  checkPendingFixtureRatchet,
  checkServiceDial,
  checkShareDepth,
  checkSheetPromises,
  checkSocialMeta,
  checkTapsToDsp,
  evaluatePerfBudget,
  extractContactRoleLines,
  findBadAltText,
  findBlockingAxeViolations,
  findDirectDspLinkAboveFold,
  findDuplicateContactRoles,
  findPlaceholderText,
  findTapTargetViolations,
  findTextOverCoverArt,
  isRealAltText,
  LCP_TARGET_MS,
  PERF_CEILINGS,
  type PerfBudgets,
  PUBLIC_SURFACE_TEMPLATES,
  pendingTemplateIds,
  perfMetricsFromLighthouse,
  validatePerfBaseline,
  validateRatchetTransition,
} from '@/lib/quality/public-surface-checks';
import baseline from '../../../../public-surface-quality.baseline.json';

const budgets = baseline.perf as PerfBudgets;
const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});
const goodMeta = {
  'og:image': 'https://jov.ie/og/tim.png',
  'og:title': 'Tim White',
  'og:description': 'Music by Tim White',
  'twitter:card': 'summary_large_image',
};

describe('1. performance budgets + lock_down ratchet', () => {
  it('RED: audited prod LCP 5449/5667ms fails the 4000ms budget', () => {
    for (const lcpMs of [5449, 5667]) {
      const out = evaluatePerfBudget({ lcpMs }, budgets, '/tim');
      expect(out.map(x => x.rule)).toContain('perf-lcp');
    }
  });
  it('RED: audited ~1.05MB JS and 102 requests fail their budgets', () => {
    const out = evaluatePerfBudget(
      { jsTransferBytes: 1_050_000, requestCount: 102 },
      budgets
    );
    expect(out.map(x => x.rule).sort()).toEqual([
      'perf-js-bytes',
      'perf-requests',
    ]);
  });
  it('RED: CLS above 0.05 fails', () => {
    expect(evaluatePerfBudget({ cls: 0.06 }, budgets)[0]?.rule).toBe(
      'perf-cls'
    );
  });
  it('GREEN: within budget passes (the 1919ms run)', () => {
    expect(
      evaluatePerfBudget(
        { lcpMs: 1919, jsTransferBytes: 500_000, requestCount: 55, cls: 0 },
        budgets
      )
    ).toEqual([]);
  });
  it('baseline stores lcp lock_down <= 4000 with the 2500 target', () => {
    expect(budgets.lcpMs.lock_down).toBeLessThanOrEqual(4000);
    expect(budgets.lcpMs.target).toBe(LCP_TARGET_MS);
    expect(validatePerfBaseline(budgets)).toEqual([]);
  });
  it('RED: a baseline raised above the ceilings is rejected', () => {
    const raised = {
      ...budgets,
      lcpMs: { lock_down: 5000, target: 2500 },
    } satisfies PerfBudgets;
    expect(validatePerfBaseline(raised)[0]?.rule).toBe('perf-ratchet');
    expect(PERF_CEILINGS.lcpMs).toBe(4000);
  });
  it('RED: ratchet transition may only lower, never raise', () => {
    const raised = {
      ...budgets,
      requestCount: {
        ...budgets.requestCount,
        lock_down: budgets.requestCount.lock_down + 1,
      },
    };
    expect(validateRatchetTransition(budgets, raised)).toHaveLength(1);
    const lowered = {
      ...budgets,
      lcpMs: { lock_down: 3000, target: 2500 },
    };
    expect(validateRatchetTransition(budgets, lowered)).toEqual([]);
  });
  it('extracts budgeted metrics from a Lighthouse result', () => {
    const metrics = perfMetricsFromLighthouse({
      audits: {
        'largest-contentful-paint': { numericValue: 5449 },
        'cumulative-layout-shift': { numericValue: 0 },
        'network-requests': {
          details: {
            items: [
              { resourceType: 'Script', transferSize: 500_000 },
              { resourceType: 'Script', transferSize: 550_000 },
              { resourceType: 'Image', transferSize: 9_000 },
            ],
          },
        },
      },
    });
    expect(metrics).toEqual({
      lcpMs: 5449,
      cls: 0,
      jsTransferBytes: 1_050_000,
      requestCount: 3,
    });
    expect(evaluatePerfBudget(metrics, budgets).map(x => x.rule)).toEqual([
      'perf-lcp',
      'perf-js-bytes',
    ]);
  });
});

describe('2. tap targets >= 44px at 390px', () => {
  it('RED: 32x32 and 44x20 targets fail; hidden ones are ignored', () => {
    const out = findTapTargetViolations([
      { description: 'button.icon', rect: rect(0, 0, 32, 32), visible: true },
      { description: 'a.inline', rect: rect(0, 0, 80, 20), visible: true },
      {
        description: 'button.hidden',
        rect: rect(0, 0, 10, 10),
        visible: false,
      },
    ]);
    expect(out).toHaveLength(2);
  });
  it('GREEN: 44x44 passes', () => {
    expect(
      findTapTargetViolations([
        { description: 'a', rect: rect(0, 0, 44, 44), visible: true },
      ])
    ).toEqual([]);
  });
});

describe('3. axe serious/critical = 0', () => {
  it('RED: label-content-name-mismatch (serious) is reported', () => {
    const out = findBlockingAxeViolations([
      { id: 'label-content-name-mismatch', impact: 'serious', nodes: [{}] },
      { id: 'region', impact: 'moderate', nodes: [{}] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.message).toContain('label-content-name-mismatch');
  });
  it('GREEN: minor/moderate only passes', () => {
    expect(
      findBlockingAxeViolations([{ id: 'region', impact: 'moderate' }])
    ).toEqual([]);
  });
});

describe('4. placeholder strings + duplicate contact roles', () => {
  it.each(['TBF', 'TBD', 'Lorem ipsum dolor'])('RED: "%s" is flagged', text => {
    expect(findPlaceholderText(`Bookings ${text}`)).toHaveLength(1);
  });
  it('RED: Jovie Technology Inc as artist contact is flagged only in contact scope', () => {
    expect(findPlaceholderText('Jovie Technology Inc', 'contact')).toHaveLength(
      1
    );
    expect(findPlaceholderText('Jovie Technology Inc', 'general')).toEqual([]);
  });
  it('RED: About tab showing TBF twice reports the role duplication', () => {
    const about =
      'Management\nTBF\nManagement\nTBF\nBookings / Touring\nmaya@x.com';
    const roles = extractContactRoleLines(about);
    expect(findDuplicateContactRoles(roles)).toHaveLength(1);
    expect(findPlaceholderText(about)).toHaveLength(1);
  });
  it('GREEN: clean contacts pass', () => {
    const clean = 'Management\nA B\nBookings / Touring\nC D';
    expect(findDuplicateContactRoles(extractContactRoleLines(clean))).toEqual(
      []
    );
    expect(findPlaceholderText(clean, 'contact')).toEqual([]);
  });
});

describe('5. no text over cover art', () => {
  const art = [rect(0, 0, 390, 390)];
  it('RED: hero title inside the art rect is flagged', () => {
    const out = findTextOverCoverArt(
      [{ text: 'Neon Skyline', rect: rect(20, 330, 200, 32) }],
      art
    );
    expect(out).toHaveLength(1);
  });
  it('GREEN: title below the art (touching edge) passes', () => {
    expect(
      findTextOverCoverArt(
        [{ text: 'Neon Skyline', rect: rect(20, 390, 200, 32) }],
        art
      )
    ).toEqual([]);
  });
});

describe('6. service dial renders with 2+ services', () => {
  it('RED: 2 services without the dial fails', () => {
    expect(
      checkServiceDial({ serviceCount: 2, dialPresent: false })
    ).toHaveLength(1);
    expect(
      checkServiceDial({ serviceCount: 5, dialPresent: false })
    ).toHaveLength(1);
  });
  it('GREEN: dial present, or fewer than 2 services', () => {
    expect(checkServiceDial({ serviceCount: 2, dialPresent: true })).toEqual(
      []
    );
    expect(checkServiceDial({ serviceCount: 1, dialPresent: false })).toEqual(
      []
    );
    expect(checkServiceDial({ serviceCount: 0, dialPresent: false })).toEqual(
      []
    );
  });
});

describe('7. OG/meta/canonical, og:image type, alt text', () => {
  it('RED: each missing tag is reported', () => {
    const out = checkSocialMeta({}, undefined);
    expect(out).toHaveLength(5);
    expect(
      checkSocialMeta({ ...goodMeta, 'twitter:card': ' ' }, '/x')
    ).toHaveLength(1);
  });
  it('GREEN: complete meta passes', () => {
    expect(checkSocialMeta(goodMeta, 'https://jov.ie/tim')).toEqual([]);
  });
  it('RED: og:image that is HTML or 404 fails; image/png passes', () => {
    expect(checkOgImageContentType('text/html', 200)).toHaveLength(1);
    expect(checkOgImageContentType('image/png', 404)).toHaveLength(1);
    expect(checkOgImageContentType('image/png', 200)).toEqual([]);
  });
  it.each([
    '',
    '   ',
    null,
    'image',
    'Cover',
    'artwork',
    'IMG_1234.jpg',
    'cover-art.png',
    'IMG_4521',
  ])('RED: alt %j is not real', alt => {
    expect(isRealAltText(alt)).toBe(false);
  });
  it('GREEN: descriptive alt passes', () => {
    expect(isRealAltText('Neon Skyline cover art by Dua Lipa')).toBe(true);
    expect(isRealAltText('Midnight Drive')).toBe(true);
    expect(findBadAltText([{ alt: '', src: '/a.jpg' }])).toHaveLength(1);
  });
});

describe('findings 1 and 2: DSP above fold, cookie card', () => {
  const spotify = 'https://open.spotify.com/album/x';
  it('RED: DSP link below the fold or absent fails (2 taps away)', () => {
    expect(
      findDirectDspLinkAboveFold(
        [{ href: spotify, rect: rect(0, 900, 300, 48), visible: true }],
        844
      )
    ).toHaveLength(1);
    expect(findDirectDspLinkAboveFold([], 844)).toHaveLength(1);
  });
  it('GREEN: DSP link inside the fold passes', () => {
    expect(
      findDirectDspLinkAboveFold(
        [{ href: spotify, rect: rect(0, 600, 300, 48), visible: true }],
        844
      )
    ).toEqual([]);
  });
  it('RED: a tall cookie card fails; slim strip or none passes', () => {
    expect(checkCookieCardFold(rect(0, 400, 390, 444), 844)).toHaveLength(1);
    expect(checkCookieCardFold(rect(0, 780, 390, 64), 844)).toEqual([]);
    expect(checkCookieCardFold(null, 844)).toEqual([]);
  });
});

describe('9. template matrix + pending-fixture ratchet', () => {
  it('covers empty, single, many, no-events and 1 / 2+ / 0 service releases', () => {
    expect(PUBLIC_SURFACE_TEMPLATES.map(t => t.id)).toEqual([
      'profile-empty',
      'profile-single-release',
      'profile-many-release',
      'profile-no-events',
      'release-1-service',
      'release-2plus-services',
      'release-no-services',
    ]);
  });
  it('pending templates exactly match the baseline pendingFixtures', () => {
    expect(pendingTemplateIds()).toEqual(baseline.pendingFixtures);
  });
  it('RED: growing the pending list fails (shrink-only)', () => {
    expect(
      checkPendingFixtureRatchet(baseline.pendingFixtures, [
        ...baseline.pendingFixtures,
        'profile-empty',
      ])
    ).toHaveLength(1);
    expect(checkPendingFixtureRatchet(baseline.pendingFixtures, [])).toEqual(
      []
    );
  });
});

describe('budgets approved 2026-10-25: JS 600KB, 60 requests', () => {
  it('RED: 650KB JS and 61 requests fail', () => {
    expect(
      evaluatePerfBudget(
        { jsTransferBytes: 650_000, requestCount: 61 },
        budgets
      )
    ).toHaveLength(2);
  });
  it('baseline lock_downs are the approved starting ceilings', () => {
    expect(budgets.jsTransferBytes.lock_down).toBeLessThanOrEqual(600_000);
    expect(budgets.requestCount.lock_down).toBeLessThanOrEqual(60);
  });
});

describe('finding 1: DSP within 1 tap of home', () => {
  it('RED: 2-3 taps or unreachable fails', () => {
    expect(checkTapsToDsp(3)).toHaveLength(1);
    expect(checkTapsToDsp(2)).toHaveLength(1);
    expect(checkTapsToDsp(null)).toHaveLength(1);
  });
  it('GREEN: 0-1 taps passes', () => {
    expect(checkTapsToDsp(1)).toEqual([]);
  });
});

describe('finding 2: consent card', () => {
  const card = rect(10, 600, 370, 200);
  it('RED: 107x28 buttons fail and overlap with the Claim bar fails', () => {
    const out = checkConsentCard(
      {
        rect: card,
        buttons: [
          rect(0, 0, 107, 28),
          rect(0, 0, 107, 28),
          rect(0, 0, 107, 28),
        ],
      },
      [rect(0, 700, 390, 80)]
    );
    expect(out.filter(x => x.message.includes('button'))).toHaveLength(3);
    expect(out.filter(x => x.message.includes('overlaps'))).toHaveLength(1);
  });
  it('GREEN: 44px buttons, no overlap, or no card', () => {
    expect(
      checkConsentCard({ rect: card, buttons: [rect(0, 0, 120, 44)] }, [
        rect(0, 810, 390, 34),
      ])
    ).toEqual([]);
    expect(checkConsentCard(null, [])).toEqual([]);
  });
});

describe('finding 4: cropped hero', () => {
  it('RED: 390x300 render of square art with object-fit cover fails', () => {
    expect(
      checkHeroNotCropped(
        rect(0, 0, 390, 300),
        { width: 1000, height: 1000 },
        'cover'
      )
    ).toHaveLength(1);
  });
  it('GREEN: square render, or contain, passes', () => {
    expect(
      checkHeroNotCropped(
        rect(0, 0, 390, 390),
        { width: 1000, height: 1000 },
        'cover'
      )
    ).toEqual([]);
    expect(
      checkHeroNotCropped(
        rect(0, 0, 390, 300),
        { width: 1000, height: 1000 },
        'contain'
      )
    ).toEqual([]);
  });
});

describe('finding 6: OG quality + JSON-LD', () => {
  const ok = {
    ogImageAlt: 'Neon Skyline cover art',
    description: 'Listen to Neon Skyline by Dua Lipa',
    jsonLdTypes: ['MusicRecording'],
    kind: 'release' as const,
  };
  it('RED: generic alt, "Music by" description and missing JSON-LD fail', () => {
    const out = checkOgQuality({
      ogImageAlt: 'Public profile preview',
      description: 'Music by Tim White',
      jsonLdTypes: ['Person'],
      kind: 'release',
    });
    expect(out.map(x => x.rule)).toEqual([
      'og-quality',
      'og-quality',
      'jsonld-missing',
    ]);
  });
  it('GREEN: real alt/description and JSON-LD pass; profiles need no music JSON-LD', () => {
    expect(checkOgQuality(ok)).toEqual([]);
    expect(checkOgQuality({ ...ok, jsonLdTypes: [], kind: 'profile' })).toEqual(
      []
    );
  });
});

describe('finding 7: updates sheet promises', () => {
  const copy = 'Get music, shows, merch';
  it('RED: promises shows and merch that do not exist', () => {
    expect(
      checkSheetPromises(copy, { events: false, merch: false })
    ).toHaveLength(2);
  });
  it('GREEN: promises backed by data pass', () => {
    expect(checkSheetPromises(copy, { events: true, merch: true })).toEqual([]);
    expect(
      checkSheetPromises('Get new music', { events: false, merch: false })
    ).toEqual([]);
  });
});

describe('finding 9: stuck loader', () => {
  it('RED: a loader still visible after the window fails', () => {
    expect(checkNoStuckLoader(['div.animate-spin'])).toHaveLength(1);
  });
  it('GREEN: none visible passes', () => {
    expect(checkNoStuckLoader([])).toEqual([]);
  });
});

describe('finding 10: empty Events tab', () => {
  it('RED: Events tab with no events fails', () => {
    expect(
      checkEmptyEventsTab(['Music', 'Events', 'About'], false)
    ).toHaveLength(1);
    expect(checkEmptyEventsTab(['Shows'], false)).toHaveLength(1);
  });
  it('GREEN: hidden when empty, shown when events exist', () => {
    expect(checkEmptyEventsTab(['Music', 'About'], false)).toEqual([]);
    expect(checkEmptyEventsTab(['Music', 'Events'], true)).toEqual([]);
  });
});

describe('finding 11: share within 1 tap', () => {
  it('RED: 3 taps or absent fails', () => {
    expect(checkShareDepth(3)).toHaveLength(1);
    expect(checkShareDepth(null)).toHaveLength(1);
  });
  it('GREEN: visible on home (0) or 1 tap passes', () => {
    expect(checkShareDepth(0)).toEqual([]);
    expect(checkShareDepth(1)).toEqual([]);
  });
});
