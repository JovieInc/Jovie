/**
 * JOV-INV-012 optimization contract for public-profile desktop exclusivity
 * (JOV-5995).
 *
 * Uses the existing analytics, model-experiment, audience-event, YouTube
 * experiment, and release-to-revenue surfaces. Do not add a parallel stack.
 */

export const PUBLIC_PROFILE_DESKTOP_VARIANT_ID =
  'public-profile-desktop:exclusive-composition:v1' as const;

export const PUBLIC_PROFILE_DESKTOP_MIN_WIDTH_PX = 1180;

export const PUBLIC_PROFILE_DESKTOP_MEDIA_QUERY =
  `(min-width: ${PUBLIC_PROFILE_DESKTOP_MIN_WIDTH_PX}px)` as const;

export const PUBLIC_PROFILE_DESKTOP_EVENTS = {
  EXPOSURE: 'profile_claim_banner_impression',
  OUTCOME: 'profile_claim_banner_click',
} as const;

export const PUBLIC_PROFILE_DESKTOP_CONTEXT = {
  variantIdentity: PUBLIC_PROFILE_DESKTOP_VARIANT_ID,
  platform: 'web',
  contentVariant: 'exclusive-desktop-composition',
} as const;

export function readPublicProfileLayout(): 'desktop' | 'compact' {
  if (
    typeof globalThis.matchMedia !== 'function' ||
    globalThis.window === undefined
  ) {
    return 'compact';
  }

  return globalThis.matchMedia(PUBLIC_PROFILE_DESKTOP_MEDIA_QUERY).matches
    ? 'desktop'
    : 'compact';
}

export const PUBLIC_PROFILE_DESKTOP_OPTIMIZATION_CONTRACT = {
  variantIdentity: PUBLIC_PROFILE_DESKTOP_VARIANT_ID,
  exposure: PUBLIC_PROFILE_DESKTOP_EVENTS.EXPOSURE,
  outcome: PUBLIC_PROFILE_DESKTOP_EVENTS.OUTCOME,
  attribution: {
    surfaces: [
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ],
    eventProperties: [
      'variantIdentity',
      'platform',
      'contentVariant',
      'layout',
    ],
  },
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'content-variant',
  ],
  hypothesis:
    'An exclusive desktop composition (no unlabeled 430px compact shell or mobile tab bar) converts more unclaimed-profile visitors into Verify & Claim starts than the hybrid phone-width desktop presentation.',
  primaryMetric:
    'profile_claim_banner_click / profile_claim_banner_impression for layout=desktop',
  guardrails: [
    'Production desktop routes render the desktop surface only; compact chrome stays hidden at 1180px.',
    'A compact surface at desktop width is allowed only inside a labeled, framed, keyboard-exitable preview.',
    'Verify & Claim stays one line with a 44px hit target and accessible artist name.',
    'Do not persist inferred demographics or raw profile-handle search text beyond the existing claim-banner properties.',
  ],
  privacyAndConsent:
    'Anonymous first-party analytics only. No sensitive demographic inference. No consent-gated identity stitching.',
  optimizerOwner: 'Product',
  cadence: 'weekly until a founder promote or rollback decision',
  decisionWriteback:
    'Keep exclusive desktop composition as control. Challengers require a new variantIdentity. Decisions write back on JOV-5995 and this contract.',
  rollbackOrControl:
    'Keep desktop exclusivity as control. Do not restore the unlabeled 430px compact shell or bottom tab bar at desktop breakpoints.',
} as const;
