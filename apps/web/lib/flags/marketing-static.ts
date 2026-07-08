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
  SHOW_PHONE_TOUR: false,
  SHOW_LOGO_BAR: false,
  SHOW_FEATURE_SHOWCASE: false,
  SHOW_FINAL_CTA: false,
  SHOW_HOMEPAGE_SECTIONS: false,
  SHOW_HOMEPAGE_V2_SOCIAL_PROOF: false,
  SHOW_HOMEPAGE_V2_TRUST: false,
  SHOW_HOMEPAGE_V2_SYSTEM_OVERVIEW: false,
  SHOW_HOMEPAGE_V2_SPOTLIGHT: false,
  SHOW_HOMEPAGE_V2_CAPTURE_REACTIVATE: false,
  SHOW_HOMEPAGE_V2_POWER_GRID: false,
  SHOW_HOMEPAGE_V2_PRICING: false,
  SHOW_HOMEPAGE_V2_FINAL_CTA: false,
  SHOW_HOMEPAGE_GO_LIVE_SECTION: false,
  SHOW_HOMEPAGE_FAQ: false,
  // Prelaunch waitlist gate. When true, public-front-door CTAs on the
  // marketing homepage render as "Request access" (waitlisting everyone who
  // comes in). When false, they revert to "Claim your free profile". The
  // server-side waitlist gate (`isWaitlistGateEnabled`) handles routing once
  // a user hits /signup; this flag only controls marketing copy. Flip to
  // false to open the doors.
  WAITLIST_ENABLED: false,
  SHOW_HOMEPAGE_V2_FOOTER_LINKS: false,
  SHOW_ARTIST_PROFILE_PAY_FLOW_VIDEO: false,
  SHOW_FORGEUI_MARKETING_UPDATES: false,
  SHOW_HOMEPAGE_AI_COMPOSER_SECTION: false,
  SHOW_HOMEPAGE_CENTER_NAV: false,
  SHOW_HOMEPAGE_FRIDAY_RHYTHM: false,
  SHOW_HOMEPAGE_UNLOCKED_SECTIONS: false,
  SHOW_HOME_REFRESH_2026: false,
  SHOW_MARKETING_FULL_FOOTER: false,
  SHOW_MARKETING_CENTER_NAV: false,
  // V1_DESIGN flags have INVERTED semantics: true = render the OLD design.
  // #11484 ("default feature flags on") blanket-flipped every flag false→true,
  // which silently reverted the homepage to HomeV1Design and bypassed the V2
  // hero + sections that same PR enabled. Restore the pre-#11484 known-good state.
  SHOW_HOME_V1_DESIGN: false,
  SHOW_PUBLIC_PROFILE_V1_DESIGN: false,
} as const;

export type MarketingStaticFlagName = keyof typeof FEATURE_FLAGS;
