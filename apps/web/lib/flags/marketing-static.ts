/**
 * Static-only marketing flags.
 *
 * These flags must remain build-time constants so homepage and marketing routes
 * stay fully static.
 */
export const FEATURE_FLAGS = {
  SHOW_EXAMPLE_PROFILES_CAROUSEL: true,
  SHOW_SEE_IT_IN_ACTION: true,
  SHOW_REPLACES_SECTION: true,
  SHOW_PHONE_TOUR: true,
  SHOW_LOGO_BAR: true,
  SHOW_FEATURE_SHOWCASE: true,
  SHOW_FINAL_CTA: true,
  SHOW_HOMEPAGE_SECTIONS: true,
  SHOW_HOMEPAGE_V2_SOCIAL_PROOF: true,
  SHOW_HOMEPAGE_V2_TRUST: true,
  SHOW_HOMEPAGE_V2_SYSTEM_OVERVIEW: true,
  SHOW_HOMEPAGE_V2_SPOTLIGHT: true,
  SHOW_HOMEPAGE_V2_CAPTURE_REACTIVATE: true,
  SHOW_HOMEPAGE_V2_POWER_GRID: true,
  SHOW_HOMEPAGE_V2_PRICING: true,
  SHOW_HOMEPAGE_V2_FINAL_CTA: true,
  SHOW_HOMEPAGE_GO_LIVE_SECTION: true,
  SHOW_HOMEPAGE_FAQ: true,
  // Prelaunch waitlist gate. When true, public-front-door CTAs on the
  // marketing homepage render as "Request access" (waitlisting everyone who
  // comes in). When false, they revert to "Claim your free profile". The
  // server-side waitlist gate (`isWaitlistGateEnabled`) handles routing once
  // a user hits /signup; this flag only controls marketing copy. Flip to
  // false to open the doors.
  WAITLIST_ENABLED: true,
  SHOW_HOMEPAGE_V2_FOOTER_LINKS: true,
  SHOW_ARTIST_PROFILE_PAY_FLOW_VIDEO: true,
  SHOW_FORGEUI_MARKETING_UPDATES: true,
  SHOW_HOMEPAGE_AI_COMPOSER_SECTION: true,
  SHOW_HOMEPAGE_CENTER_NAV: true,
  SHOW_HOMEPAGE_FRIDAY_RHYTHM: true,
  SHOW_HOMEPAGE_UNLOCKED_SECTIONS: true,
  SHOW_HOME_REFRESH_2026: true,
  SHOW_MARKETING_FULL_FOOTER: true,
  SHOW_MARKETING_CENTER_NAV: true,
  // V1_DESIGN flags have INVERTED semantics: true = render the OLD design.
  // #11484 ("default feature flags on") blanket-flipped every flag false→true,
  // which silently reverted the homepage to HomeV1Design and bypassed the V2
  // hero + sections that same PR enabled. Restore the pre-#11484 known-good state.
  SHOW_HOME_V1_DESIGN: false,
  SHOW_PUBLIC_PROFILE_V1_DESIGN: false,
} as const;

export type MarketingStaticFlagName = keyof typeof FEATURE_FLAGS;
