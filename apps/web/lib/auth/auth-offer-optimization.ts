/**
 * JOV-INV-012 optimization contract for the auth-shell paid-offer handoff.
 *
 * Uses the existing analytics, model-experiment, audience-event, YouTube
 * experiment, and release-to-revenue surfaces. Do not add a parallel stack.
 * Artist names and emails are never written as analytics properties.
 */

export const AUTH_OFFER_SHELL_VARIANT_ID =
  'auth-shell:preserve-offer-handoff:v1' as const;

export const AUTH_OFFER_SHELL_EVENTS = {
  EXPOSURE: 'auth_offer_shell_exposed',
  AUTH_STARTED: 'auth_offer_auth_started',
  PLAN_INTENT_CAPTURED: 'plan_intent_captured',
} as const;

export const AUTH_OFFER_SHELL_CONTEXT = {
  variantIdentity: AUTH_OFFER_SHELL_VARIANT_ID,
  platform: 'web',
  contentVariant: 'preserve-offer-handoff',
} as const;

export const AUTH_OFFER_SHELL_OPTIMIZATION_CONTRACT = {
  variantIdentity: AUTH_OFFER_SHELL_VARIANT_ID,
  exposure: AUTH_OFFER_SHELL_EVENTS.EXPOSURE,
  outcome: AUTH_OFFER_SHELL_EVENTS.AUTH_STARTED,
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
      'plan',
      'interval',
      'hasArtist',
    ],
    relatedEvents: [AUTH_OFFER_SHELL_EVENTS.PLAN_INTENT_CAPTURED],
  },
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'content-variant',
  ],
  hypothesis:
    'Preserving plan, interval, and artist through Sign in, Trouble, provider, and email, and showing registry Pro trial terms instead of dropping the offer, increases Pro checkout starts without inventing Max trial copy or pitching a new trial to existing subscribers.',
  primaryMetric:
    'auth_offer_auth_started / auth_offer_shell_exposed for plan=pro arrivals',
  guardrails: [
    'Max, team, and enterprise arrivals never show trial, 14-day, or no-card copy.',
    'Existing paid subscribers go to account billing settings, not a new-trial checkout.',
    'Offer copy comes from offer-truth registry terms; do not invent trial length or card requirements.',
    'Do not persist artist names, emails, or inferred demographics in analytics properties.',
  ],
  privacyAndConsent:
    'Anonymous auth-funnel analytics only. Plan tier and interval are offer identities, not people. Artist names stay in first-party session storage and are never sent as event properties. No sensitive demographic inference. No consent-gated identity stitching.',
  optimizerOwner: 'Product',
  cadence: 'weekly until a founder promote or rollback decision',
  decisionWriteback:
    'Keep this variant as control. Challengers require a new variantIdentity. Decisions write back on JOV-6207 and this contract. Offer-copy bake-offs reuse model-experiments; do not add a parallel analytics stack.',
  rollbackOrControl:
    'Revert AuthShell offer summary, auth cross-link plan/interval/artist forwarding, and authenticated subscriber billing redirects. Auth entry returns to dropping the paid offer across Sign in / Trouble / provider / email.',
} as const;
