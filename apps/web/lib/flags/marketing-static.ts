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
  // Prelaunch waitlist gate. When true, public-front-door CTAs render as
  // "Request access" and land on /signup. When false, they revert to
  // "Claim your free profile" on /start. The server-side waitlist gate
  // (`isWaitlistGateEnabled`) still owns post-auth routing. Flip to false
  // to open the doors. /waitlist remains the pending-receipt route.
  WAITLIST_ENABLED: true,
  SHOW_HOMEPAGE_V2_FOOTER_LINKS: true,
  // JOV-7208 founder gate: keep the product demo video dark until the media is
  // a JOV-6251 approved master, JOV-6220 mobile/desktop render + playback
  // certification is recorded, and Tim approves the video on the unflag PR.
  SHOW_PRODUCT_DEMO_VIDEO: false,
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
  // which silently reverted a page to its V1 design. Keep this one false.
  SHOW_PUBLIC_PROFILE_V1_DESIGN: false,
  // Public About body and commercial footer links. Stays off so production
  // keeps the current page until this refresh is explicitly flipped.
  SHOW_PUBLIC_ABOUT_FOOTER_REFRESH: false,
  // Hero light prototype. Off keeps today's homepage pixel-identical.
  // CSS is the invariant-safe look (no canvas). WebGL is a second flag and
  // does nothing unless the CSS flag is also on. Tim has not approved the
  // night-dj-harmony-v1 canvas exception; do not flip either default.
  SHOW_HOMEPAGE_HERO_LIGHT: false,
  SHOW_HOMEPAGE_HERO_LIGHT_WEBGL: false,
} as const;

export type MarketingStaticFlagName = keyof typeof FEATURE_FLAGS;
