const SHOW_FULL_HOMEPAGE_FOOTER = process.env.NODE_ENV !== 'production';

/**
 * Static-only marketing flags.
 *
 * These flags must remain build-time constants so homepage and marketing routes
 * stay fully static.
 */
export const FEATURE_FLAGS = {
  SHOW_EXAMPLE_PROFILES_CAROUSEL: false,
  SHOW_SEE_IT_IN_ACTION: false,
  SHOW_REPLACES_SECTION: false,
  SHOW_PHONE_TOUR: true,
  SHOW_LOGO_BAR: true,
  SHOW_FEATURE_SHOWCASE: false,
  SHOW_FINAL_CTA: true,
  SHOW_HOMEPAGE_SECTIONS: false,
  SHOW_HOMEPAGE_V2_SOCIAL_PROOF: false,
  SHOW_HOMEPAGE_V2_TRUST: false,
  SHOW_HOMEPAGE_V2_SYSTEM_OVERVIEW: true,
  SHOW_HOMEPAGE_V2_SPOTLIGHT: true,
  SHOW_HOMEPAGE_V2_CAPTURE_REACTIVATE: true,
  SHOW_HOMEPAGE_V2_POWER_GRID: false,
  SHOW_HOMEPAGE_V2_PRICING: true,
  SHOW_HOMEPAGE_V2_FINAL_CTA: true,
  SHOW_HOMEPAGE_V2_FOOTER_LINKS: SHOW_FULL_HOMEPAGE_FOOTER,
} as const;

export type MarketingStaticFlagName = keyof typeof FEATURE_FLAGS;
