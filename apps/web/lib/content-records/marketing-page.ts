import { lintCopy } from '@jovie/copy';
import { z } from 'zod';
import surfaceCensus from '@/data/designSystem/surfaceCensus.json';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { MARKETING_SECTIONS } from '@/data/marketing/sections';
import icpLanguage from '../../../../scripts/invariants/icp-language/config.json';
import { experimentSchema } from './experiment';
import type { ContentKindDefinition } from './kind';

/**
 * Marketing page spec: an ordered list of design-system sections, each with a
 * registered variant and the copy slots that section exposes. Publishing a
 * spec changes the live page without a code deploy.
 *
 * What is NOT data here, on purpose:
 * - Layout, components, and styling. A section id + variant must exist in
 *   `MARKETING_SECTIONS` (the DS section registry) AND have a renderer in
 *   `components/marketing/page-spec/` — a spec cannot produce off-system UI.
 * - Prices, plan names, and included features. Those come from offer truth
 *   and the entitlement registry (same price everywhere); copy slots reject
 *   currency and price-period text.
 * - Locked lines. The homepage headline is the company identity line
 *   (Tim, 2026-10-22) and has no slot.
 */

const MARKETING_PAGE_SPEC_SCHEMA_VERSION = 1;

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(value => !/[\n\r<>]/.test(value), 'Single line, no markup');

const HeroSection = z
  .object({
    section: z.literal('hero'),
    variant: z.literal('split-claim-card'),
    copy: z
      .object({
        subhead: line(220),
        claimAction: line(24),
      })
      .strict(),
  })
  .strict();

const HowItWorksSection = z
  .object({
    section: z.literal('how-it-works'),
    variant: z.literal('3-step-media'),
    copy: z.object({ headline: line(90) }).strict(),
  })
  .strict();

const FeatureSplitSection = z
  .object({
    section: z.literal('feature-split'),
    variant: z.literal('editorial'),
    copy: z.object({ headline: line(90), body: line(220) }).strict(),
  })
  .strict();

const PricingSection = z
  .object({
    section: z.literal('pricing'),
    variant: z.literal('tier-cards-neutral'),
    copy: z.object({ headline: line(90), plansLinkLabel: line(32) }).strict(),
  })
  .strict();

const CtaSection = z
  .object({
    section: z.literal('cta'),
    variant: z.literal('final-single-claim'),
    copy: z.object({ headline: line(90), subhead: line(220) }).strict(),
  })
  .strict();

/**
 * The spec section registry: every section a page spec may place, bound to
 * the existing marketing component that renders it and to its DS status.
 * Entries reuse registered `MARKETING_SECTIONS` ids/variants and existing
 * components only. `dsStatus` mirrors the surface census group that owns the
 * component (`data/designSystem/surfaceCensus.json`): `canonical` when that
 * group is certified, otherwise `migrating`. Specs may place migrating
 * sections (they are what the live page renders today); the status tells
 * Summer and the DS audit which sections still need canonical certification.
 */
export type SpecSectionDsStatus = 'canonical' | 'migrating';

interface SpecSectionRegistryEntry {
  readonly section: string;
  readonly variant: string;
  readonly component: string;
  readonly source: string;
  readonly censusGroup: string;
  readonly dsStatus: SpecSectionDsStatus;
}

function censusStatus(groupId: string): SpecSectionDsStatus {
  const group = surfaceCensus.groups.find(entry => entry.id === groupId);
  return group?.status === 'canonical' ? 'canonical' : 'migrating';
}

const HOMEPAGE_SECTION_SOURCE =
  'apps/web/components/homepage/HomepageArtistProfile.tsx';

export const SPEC_SECTION_REGISTRY: readonly SpecSectionRegistryEntry[] = [
  {
    section: 'hero',
    variant: 'split-claim-card',
    component: 'HomepageArtistHero',
    source: HOMEPAGE_SECTION_SOURCE,
    censusGroup: 'home',
    dsStatus: censusStatus('home'),
  },
  {
    section: 'how-it-works',
    variant: '3-step-media',
    component: 'HomepageLoop',
    source: HOMEPAGE_SECTION_SOURCE,
    censusGroup: 'home',
    dsStatus: censusStatus('home'),
  },
  {
    section: 'feature-split',
    variant: 'editorial',
    component: 'HomepageOwnership',
    source: HOMEPAGE_SECTION_SOURCE,
    censusGroup: 'home',
    dsStatus: censusStatus('home'),
  },
  {
    section: 'pricing',
    variant: 'tier-cards-neutral',
    component: 'HomepageOffer',
    source: HOMEPAGE_SECTION_SOURCE,
    censusGroup: 'home',
    dsStatus: censusStatus('home'),
  },
  {
    section: 'cta',
    variant: 'final-single-claim',
    component: 'HomepageClose',
    source: HOMEPAGE_SECTION_SOURCE,
    censusGroup: 'home',
    dsStatus: censusStatus('home'),
  },
];

export const MarketingPageSectionSchema = z.discriminatedUnion('section', [
  HeroSection,
  HowItWorksSection,
  FeatureSplitSection,
  PricingSection,
  CtaSection,
]);

export type MarketingPageSection = z.infer<typeof MarketingPageSectionSchema>;

const SectionsSchema = z.array(MarketingPageSectionSchema).min(1).max(12);

export const MarketingPageSpecSchema = z
  .object({
    sections: SectionsSchema,
    experiment: experimentSchema(SectionsSchema).optional(),
  })
  .strict();

export type MarketingPageSpec = z.infer<typeof MarketingPageSpecSchema>;
export type MarketingPageSections = MarketingPageSpec['sections'];

export const MARKETING_PAGE_KEYS = ['home'] as const;
export type MarketingPageKey = (typeof MARKETING_PAGE_KEYS)[number];

/**
 * The code default: the five-beat homepage (Tim, 2026-11-01). A stored
 * spec must place every one of these sections (see `HOME_REQUIRED_SECTIONS`),
 * so an older published record falls back to this default instead of
 * rendering half a page.
 */
export const DEFAULT_HOME_SPEC: MarketingPageSpec = {
  sections: [
    {
      section: 'hero',
      variant: 'split-claim-card',
      copy: {
        subhead: HOMEPAGE_COPY.hero.subhead,
        claimAction: HOMEPAGE_COPY.hero.claim.action,
      },
    },
    {
      section: 'how-it-works',
      variant: '3-step-media',
      copy: { headline: HOMEPAGE_COPY.loop.headline },
    },
    {
      section: 'feature-split',
      variant: 'editorial',
      copy: {
        headline: HOMEPAGE_COPY.ownership.headline,
        body: HOMEPAGE_COPY.ownership.body,
      },
    },
    {
      section: 'pricing',
      variant: 'tier-cards-neutral',
      copy: {
        headline: HOMEPAGE_COPY.offer.headline,
        plansLinkLabel: HOMEPAGE_COPY.offer.plansLink.label,
      },
    },
    {
      section: 'cta',
      variant: 'final-single-claim',
      copy: {
        headline: HOMEPAGE_COPY.close.headline,
        subhead: HOMEPAGE_COPY.close.subhead,
      },
    },
  ],
};

/** Every homepage spec places the whole argument, never a subset. */
const HOME_REQUIRED_SECTIONS: readonly MarketingPageSection['section'][] =
  DEFAULT_HOME_SPEC.sections.map(entry => entry.section);

// Prices and plan terms come from offer truth only (same price everywhere).
const PRICE_PATTERN =
  /[$€£¥]|\b\d+(?:\.\d+)?\s*(?:usd|eur|gbp)\b|\/\s*(?:mo|month|yr|year)\b|\bper\s+(?:month|year)\b|\bfree\s+trial\b/i;

// General pages stay generic (MKT-D16): the same terms the blocking
// `scripts/invariants/icp-language/check.mjs` source guard enforces.
const ICP_TERM_PATTERNS = icpLanguage.terms.map(
  term => new RegExp(`\\b${term.replace(/\s+/g, '\\s+')}s?\\b`, 'i')
);
const GENERAL_PAGE_KEYS: ReadonlySet<string> = new Set(['home']);

function icpTermIn(text: string): string | null {
  let scrubbed = text;
  for (const { phrase } of icpLanguage.allowedPhrases) {
    scrubbed = scrubbed.replaceAll(phrase, '');
  }
  const index = ICP_TERM_PATTERNS.findIndex(pattern => pattern.test(scrubbed));
  return index === -1 ? null : (icpLanguage.terms[index] ?? null);
}

function sectionsViolations(
  sections: MarketingPageSections,
  path: string,
  generalPage: boolean
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  sections.forEach((entry, index) => {
    const at = `${path}[${index}]`;
    if (
      !SPEC_SECTION_REGISTRY.some(
        r => r.section === entry.section && r.variant === entry.variant
      )
    ) {
      errors.push(
        `${at}: "${entry.section}/${entry.variant}" is not in the spec section registry`
      );
    }
    const registered = MARKETING_SECTIONS.find(s => s.id === entry.section);
    if (!registered) {
      errors.push(
        `${at}: section "${entry.section}" is not in the DS registry`
      );
    } else if (!registered.variants.some(v => v.id === entry.variant)) {
      errors.push(
        `${at}: variant "${entry.variant}" is not registered for "${entry.section}"`
      );
    }
    if (seen.has(entry.section)) {
      errors.push(`${at}: section "${entry.section}" appears twice`);
    }
    seen.add(entry.section);
    for (const [slot, text] of Object.entries(entry.copy)) {
      if (PRICE_PATTERN.test(text)) {
        errors.push(
          `${at}.copy.${slot}: prices and plan terms come from offer truth, not page copy`
        );
      }
      const icpTerm = generalPage ? icpTermIn(text) : null;
      if (icpTerm) {
        errors.push(
          `${at}.copy.${slot}: "${icpTerm}" is audience language; general pages stay generic (MKT-D16)`
        );
      }
      const lint = lintCopy(text, {
        register: 'jovie-marketing',
        headline: slot === 'headline',
      });
      for (const finding of lint.blocking) {
        errors.push(`${at}.copy.${slot}: ${finding.rule}: ${finding.message}`);
      }
    }
  });
  if (generalPage) {
    for (const required of HOME_REQUIRED_SECTIONS) {
      if (!sections.some(entry => entry.section === required)) {
        errors.push(`${path}: the homepage must place "${required}"`);
      }
    }
  }
  if (sections[0]?.section !== 'hero') {
    errors.push(`${path}[0]: the hero section must come first`);
  }
  const ctaIndex = sections.findIndex(s => s.section === 'cta');
  if (ctaIndex !== -1 && ctaIndex !== sections.length - 1) {
    errors.push(`${path}[${ctaIndex}]: the closing cta must be last`);
  }
  return errors;
}

export function marketingPageViolations(
  spec: MarketingPageSpec,
  key: string
): string[] {
  const generalPage = GENERAL_PAGE_KEYS.has(key);
  const errors = sectionsViolations(spec.sections, 'sections', generalPage);
  spec.experiment?.variants.forEach((variant, index) => {
    errors.push(
      ...sectionsViolations(
        variant.body,
        `experiment.variants[${index}].body`,
        generalPage
      )
    );
  });
  return errors;
}

export const MARKETING_PAGE_KIND: ContentKindDefinition<MarketingPageSpec> = {
  kind: 'marketing-page',
  schemaVersion: MARKETING_PAGE_SPEC_SCHEMA_VERSION,
  schema: MarketingPageSpecSchema,
  keys: MARKETING_PAGE_KEYS,
  defaultRecord: () => DEFAULT_HOME_SPEC,
  validate: (spec, key) => marketingPageViolations(spec, key),
  livePaths: key => (key === 'home' ? ['/'] : []),
};
