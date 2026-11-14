/**
 * Static-only marketing flags.
 *
 * These flags must remain build-time constants so homepage and marketing routes
 * stay fully static.
 */
export const FEATURE_FLAGS = {
  // Prelaunch waitlist gate. When true, public-front-door CTAs render as
  // "Request access" and land on /signup. When false, they revert to
  // "Claim your free profile" on /start. The server-side waitlist gate
  // (`isWaitlistGateEnabled`) still owns post-auth routing. Flip to false
  // to open the doors. /waitlist remains the pending-receipt route.
  WAITLIST_ENABLED: true,
  // JOV-7208 founder gate: keep the product demo video dark until the media is
  // a JOV-6251 approved master, JOV-6220 mobile/desktop render + playback
  // certification is recorded, and Tim approves the video on the unflag PR.
  SHOW_PRODUCT_DEMO_VIDEO: false,
  // Public About body and commercial footer links. Stays off so production
  // keeps the current page until this refresh is explicitly flipped.
  SHOW_PUBLIC_ABOUT_FOOTER_REFRESH: false,
} as const;

export type MarketingStaticFlagName = keyof typeof FEATURE_FLAGS;
