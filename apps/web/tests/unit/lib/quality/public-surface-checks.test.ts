import { describe, expect, it } from 'vitest';
import {
  checkCookieCardFold,
  checkOgImageContentType,
  checkPendingFixtureRatchet,
  checkServiceDial,
  checkSocialMeta,
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
        { lcpMs: 1919, jsTransferBytes: 700_000, requestCount: 60, cls: 0 },
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
