import { describe, expect, it } from 'vitest';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import { getMarketingSection } from '@/data/marketing/sections';
import {
  auditHeroRoutes,
  HERO_CODE_BINDING_BY_VARIANT,
  HERO_DECISION_TABLE,
  HERO_PEN_ID_BY_VARIANT,
  HERO_ROUTE_INTENTS,
  HERO_VARIANT_NAMES,
  heroVariantForCodeVariant,
  MARKETING_HEADER_DECISION,
  selectHeroDecision,
  UNLOCKED_HERO_CODE_VARIANTS,
} from './heroDecision';

describe('factory hero decision', () => {
  it('locks the hero table', () => {
    expect(HERO_DECISION_TABLE).toMatchInlineSnapshot(`
      [
        {
          "penId": "xm2iz",
          "useWhen": "claim conversion",
          "variant": "split-link-claim",
        },
        {
          "penId": "WQe2p",
          "useWhen": "informational",
          "variant": "left-content",
        },
        {
          "penId": "lnKPH",
          "useWhen": "two actions",
          "variant": "left-buttons",
        },
        {
          "penId": "OxwR1",
          "useWhen": "homepage only",
          "variant": "centered-homepage",
        },
        {
          "penId": "KhYER",
          "useWhen": "developer audience with a copy-command action",
          "variant": "npm-copy",
        },
        {
          "penId": "joK4X",
          "useWhen": "an aha capture exists",
          "variant": "f-layout-desktop-screenshot",
        },
        {
          "penId": "qENyP",
          "useWhen": "responsive projection only",
          "variant": "mobile-390",
        },
      ]
    `);
  });

  it('maps every code variant to its locked Pen contract', () => {
    expect(
      HERO_VARIANT_NAMES.map(name => [name, HERO_PEN_ID_BY_VARIANT[name]])
    ).toEqual([
      ['split-link-claim', 'xm2iz'],
      ['left-content', 'WQe2p'],
      ['left-buttons', 'lnKPH'],
      ['centered-homepage', 'OxwR1'],
      ['npm-copy', 'KhYER'],
      ['f-layout-desktop-screenshot', 'joK4X'],
      ['mobile-390', 'qENyP'],
    ]);
  });

  it.each([
    [{ useCase: 'claim-conversion', conversion: 'claim-profile' }, 'xm2iz'],
    [{ useCase: 'informational' }, 'WQe2p'],
    [{ useCase: 'two-actions', actionCount: 2 }, 'lnKPH'],
    [{ useCase: 'homepage', route: '/' }, 'OxwR1'],
    [
      {
        useCase: 'copy-command',
        audience: 'developer',
        action: 'copy-command',
      },
      'KhYER',
    ],
    [{ useCase: 'aha-capture', captureId: 'profile-claimed' }, 'joK4X'],
    [
      {
        useCase: 'responsive-projection',
        viewportWidth: 390,
        sourceVariant: 'left-content',
      },
      'qENyP',
    ],
  ] as const)('selects exactly one locked hero for %o', (input, penId) => {
    expect(selectHeroDecision(input)).toMatchObject({ penId });
  });

  it('keeps one eoUUU header across docked and scrolled states', () => {
    expect(MARKETING_HEADER_DECISION).toEqual({
      penId: 'eoUUU',
      instanceCount: 1,
      states: ['docked', 'scrolled'],
    });
  });

  it('rejects an F-layout hero without an aha capture', () => {
    expect(() =>
      selectHeroDecision({ useCase: 'aha-capture', captureId: ' ' })
    ).toThrow('aha capture');
  });
});

function activeHeroBindings(): Map<string, string | null> {
  const bindings = new Map<string, string | null>();
  for (const entry of MARKETING_ROUTE_MANIFEST) {
    if (entry.status !== 'active') continue;
    const hero = entry.renderedSections.find(
      section =>
        section.kind === 'approved-section' && section.sectionId === 'hero'
    );
    if (hero?.kind === 'approved-section') {
      bindings.set(entry.url, hero.variantId ?? null);
    }
  }
  return bindings;
}

describe('hero code bindings', () => {
  const heroVariants = getMarketingSection('hero').variants;

  it('maps every locked Pen hero to an active code variant or an explicit gap', () => {
    expect(
      Object.fromEntries(
        Object.entries(HERO_CODE_BINDING_BY_VARIANT).map(([name, binding]) => [
          name,
          binding.sectionVariantId,
        ])
      )
    ).toMatchInlineSnapshot(`
      {
        "centered-homepage": null,
        "f-layout-desktop-screenshot": "split-screenshot-right",
        "left-buttons": null,
        "left-content": "left-none",
        "mobile-390": null,
        "npm-copy": null,
        "split-link-claim": "split-claim-card",
      }
    `);
    for (const binding of Object.values(HERO_CODE_BINDING_BY_VARIANT)) {
      if (!binding.sectionVariantId) continue;
      expect(
        heroVariants.find(variant => variant.id === binding.sectionVariantId)
          ?.status
      ).toBe('active');
    }
  });

  it('round-trips each bound code variant to exactly one Pen hero', () => {
    for (const [name, binding] of Object.entries(
      HERO_CODE_BINDING_BY_VARIANT
    )) {
      if (binding.sectionVariantId) {
        expect(heroVariantForCodeVariant(binding.sectionVariantId)).toBe(name);
      }
    }
    expect(heroVariantForCodeVariant('not-a-variant')).toBeNull();
  });

  it('accounts for every active code hero variant (unlocked list only shrinks)', () => {
    const bound = new Set<string>(
      Object.values(HERO_CODE_BINDING_BY_VARIANT).flatMap(binding =>
        binding.sectionVariantId ? [binding.sectionVariantId] : []
      )
    );
    const unlocked = new Set<string>(UNLOCKED_HERO_CODE_VARIANTS);
    const active = heroVariants
      .filter(variant => variant.status === 'active')
      .map(variant => variant.id);
    expect(active.filter(id => !bound.has(id) && !unlocked.has(id))).toEqual(
      []
    );
    expect([...unlocked].filter(id => bound.has(id))).toEqual([]);
    expect([...unlocked].filter(id => !active.includes(id))).toEqual([]);
  });
});

describe('route hero audit', () => {
  it('declares a hero job for every active route that renders a hero', () => {
    const intentUrls = HERO_ROUTE_INTENTS.map(intent => intent.url).sort();
    expect(intentUrls).toEqual([...activeHeroBindings().keys()].sort());
    expect(new Set(intentUrls).size).toBe(intentUrls.length);
  });

  it('pins current route hero mismatches against the table (shrink-only)', () => {
    const rows = auditHeroRoutes(activeHeroBindings());
    const summary = Object.fromEntries(
      rows.map(row => [
        row.url,
        row.mismatch
          ? `${row.mismatch}: ${row.observedCodeVariant ?? '-'} -> ${row.expected}`
          : `ok: ${row.expected}`,
      ])
    );
    // Fixing a route updates this snapshot to fewer mismatches. A new
    // mismatch means the route chose a hero the table does not allow.
    expect(summary).toMatchInlineSnapshot(`
      {
        "/": "wrong-variant: split-claim-card -> centered-homepage",
        "/about": "unbound: - -> left-content",
        "/alternatives/*": "unbound: - -> left-content",
        "/artist-notifications": "unbound: - -> split-link-claim",
        "/artist-profiles": "unlocked-code-variant: centered-phone -> split-link-claim",
        "/blog": "unbound: - -> left-content",
        "/blog/category/*": "unbound: - -> left-content",
        "/card": "ok: f-layout-desktop-screenshot",
        "/cli": "unlocked-code-variant: centered-none -> npm-copy",
        "/compare/*": "unbound: - -> left-content",
        "/download": "unbound: - -> left-buttons",
        "/instant-merch": "unbound: - -> left-buttons",
        "/launch": "unbound: - -> left-buttons",
        "/new": "unbound: - -> left-buttons",
        "/pay": "unbound: - -> split-link-claim",
        "/pricing": "unlocked-code-variant: centered-none -> left-buttons",
        "/product": "unbound: - -> split-link-claim",
        "/smart-links": "unbound: - -> left-buttons",
        "/solutions/*": "unbound: - -> split-link-claim",
        "/support": "unbound: - -> left-content",
        "/voice": "unbound: - -> left-buttons",
        "/waitlist": "unbound: - -> left-content",
        "/youtube-thumbnails": "ok: left-content",
      }
    `);
  });

  it('classifies unbound, unlocked, wrong and matching bindings', () => {
    const intents = [
      { url: '/a', input: { useCase: 'informational' }, why: '' },
      { url: '/b', input: { useCase: 'informational' }, why: '' },
      { url: '/c', input: { useCase: 'informational' }, why: '' },
      { url: '/d', input: { useCase: 'informational' }, why: '' },
    ] as const;
    const rows = auditHeroRoutes(
      new Map([
        ['/a', null],
        ['/b', 'centered-none'],
        ['/c', 'split-claim-card'],
        ['/d', 'left-none'],
      ]),
      intents
    );
    expect(rows.map(row => row.mismatch)).toEqual([
      'unbound',
      'unlocked-code-variant',
      'wrong-variant',
      null,
    ]);
  });
});
