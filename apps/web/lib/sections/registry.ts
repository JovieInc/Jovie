/**
 * Canonical landing-page section registry.
 *
 * One source of truth for "what landing-page sections exist, in what
 * variants, where they're used, and what's a consolidation candidate."
 *
 * Read by:
 *   - `/exp/component-checker` — full-bleed single-section preview
 *   - `/exp/page-builder` — composes sections into a full landing page
 *
 * Rules:
 *   - Every section that ships on a landing page MUST have an entry here.
 *   - When you add a new variant, add it here too — both preview surfaces
 *     pick it up automatically.
 *   - `status: 'consolidate'` means the variant exists but should be merged
 *     into a canonical sibling. `status: 'orphaned'` means delete-on-sight.
 */

import type { ReactNode } from 'react';

export type SectionCategory =
  | 'header'
  | 'hero'
  | 'logo-bar'
  | 'feature-card'
  | 'testimonial'
  | 'faq'
  | 'footer-cta'
  | 'footer';

export type SectionStatus = 'canonical' | 'consolidate' | 'orphaned';

export interface SectionVariant {
  /** Stable id for URL/query-param routing (kebab-case). */
  readonly id: string;
  readonly category: SectionCategory;
  /** Human-readable label for the toolbar dropdown. */
  readonly label: string;
  /** One-line description for the metadata panel. */
  readonly description: string;
  /** Repo-relative path of the component file. */
  readonly componentPath: string;
  /** Routes / surfaces currently rendering this variant. Empty array = orphaned. */
  readonly usedIn: readonly string[];
  readonly status: SectionStatus;
  /**
   * If `status: 'consolidate'` or `'orphaned'`, the id of the canonical
   * variant this should merge into.
   */
  readonly mergeInto?: string;
  /** Whether this variant should be the default pick when the category is selected. */
  readonly canonical?: boolean;
  /** Renders the variant with realistic demo data. Server-renderable when possible. */
  readonly render: () => ReactNode;
}

export const SECTION_CATEGORY_LABELS: Record<SectionCategory, string> = {
  header: 'Header',
  hero: 'Hero',
  'logo-bar': 'Logo bar',
  'feature-card': 'Feature card',
  testimonial: 'Testimonial',
  faq: 'FAQ',
  'footer-cta': 'Footer CTA',
  footer: 'Footer',
};

/** All categories in canonical display order (top of page → bottom). */
export const SECTION_CATEGORIES_ORDERED: readonly SectionCategory[] = [
  'header',
  'hero',
  'logo-bar',
  'feature-card',
  'testimonial',
  'faq',
  'footer-cta',
  'footer',
];

import { FAQ_VARIANTS } from './variants/faq';
import { FEATURE_CARD_VARIANTS } from './variants/feature-card';
import { FOOTER_VARIANTS } from './variants/footer';
import { FOOTER_CTA_VARIANTS } from './variants/footer-cta';
/**
 * Variant entries are imported from `./variants/*` — split per category so
 * adding a new section doesn't trigger a giant diff in this file.
 */
import { HEADER_VARIANTS } from './variants/header';
import { HERO_VARIANTS } from './variants/hero';
import { LOGO_BAR_VARIANTS } from './variants/logo-bar';
import { TESTIMONIAL_VARIANTS } from './variants/testimonial';

export const SECTION_REGISTRY: readonly SectionVariant[] = [
  ...HEADER_VARIANTS,
  ...HERO_VARIANTS,
  ...LOGO_BAR_VARIANTS,
  ...FEATURE_CARD_VARIANTS,
  ...TESTIMONIAL_VARIANTS,
  ...FAQ_VARIANTS,
  ...FOOTER_CTA_VARIANTS,
  ...FOOTER_VARIANTS,
];

export function getSectionById(id: string): SectionVariant | undefined {
  return SECTION_REGISTRY.find(v => v.id === id);
}

export function getSectionsByCategory(
  category: SectionCategory
): readonly SectionVariant[] {
  return SECTION_REGISTRY.filter(v => v.category === category);
}

export function getCanonicalForCategory(
  category: SectionCategory
): SectionVariant | undefined {
  const inCategory = getSectionsByCategory(category);
  return inCategory.find(v => v.canonical) ?? inCategory[0];
}

// ─── Homepage composition ───────────────────────────────────────────────────

/** Feature flags that affect homepage section composition. */
export interface HomepageCompositionFlags {
  /** `SHOW_HOMEPAGE_GO_LIVE_SECTION` */
  readonly showGoLive: boolean;
  /** `SHOW_HOMEPAGE_FRIDAY_RHYTHM` */
  readonly showFridayRhythm: boolean;
  /** `SHOW_HOME_REFRESH_2026` */
  readonly showHomeRefresh2026: boolean;
  /** `SHOW_HOMEPAGE_V2_PRICING` */
  readonly showV2Pricing: boolean;
  /** `SHOW_HOMEPAGE_FAQ` */
  readonly showFaq: boolean;
  /** `SHOW_HOMEPAGE_V2_FINAL_CTA` */
  readonly showV2FinalCta: boolean;
}

/**
 * Composes ordered homepage body-section IDs from feature flags.
 *
 * The hero is rendered separately (outside the story stack) and is NOT
 * included here. Returns body sections and a separate final CTA so the
 * page can keep the CTA outside the `showUnlockedSections` gate.
 *
 * Every id returned by this function must have a corresponding case in
 * the page's `HomepageSection` renderer switch.
 */
export function composeHomepageSections(flags: HomepageCompositionFlags): {
  readonly bodyIds: readonly string[];
  readonly finalCtaId: string | null;
} {
  const sections: string[] = [];

  sections.push('homepage-product-statement');

  if (flags.showGoLive) {
    sections.push('homepage-go-live-steps');
  }

  sections.push('homepage-workspace-section');
  sections.push('homepage-artist-profiles-carousel');

  if (flags.showFridayRhythm) {
    sections.push('friday-rhythm-section');
  }

  if (flags.showHomeRefresh2026) {
    sections.push('home-bento-pairs');
    sections.push('home-loop-diagram');
    sections.push('home-stat-quote');
  }

  if (flags.showV2Pricing) {
    sections.push('homepage-v2-pricing');
  }

  if (flags.showFaq) {
    sections.push('homepage-faq');
  }

  return {
    bodyIds: sections,
    finalCtaId: flags.showV2FinalCta ? 'homepage-v2-final-cta' : null,
  };
}
