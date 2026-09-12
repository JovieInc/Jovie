/**
 * JOV-INV-012 optimization contract for the canonical public marketing shell.
 *
 * Uses the existing analytics, model-experiment, audience-event, YouTube
 * experiment, and release-to-revenue surfaces. Do not add a parallel stack.
 */

import { WAITLIST_FRONT_DOOR_EVENTS } from '@/data/homepageFrontDoorCta';

export const CANONICAL_PUBLIC_SHELL_VARIANT_ID =
  'canonical-public-shell:customers-product-pricing:v1' as const;

export const CANONICAL_PUBLIC_SHELL_EVENTS = {
  EXPOSURE: 'canonical_public_shell_exposed',
} as const;

export const CANONICAL_PUBLIC_SHELL_CONTEXT = {
  variantIdentity: CANONICAL_PUBLIC_SHELL_VARIANT_ID,
  platform: 'web',
  contentVariant: 'customers-product-pricing',
} as const;

export const CANONICAL_PUBLIC_SHELL_OPTIMIZATION_CONTRACT = {
  variantIdentity: CANONICAL_PUBLIC_SHELL_VARIANT_ID,
  exposure: CANONICAL_PUBLIC_SHELL_EVENTS.EXPOSURE,
  outcome: WAITLIST_FRONT_DOOR_EVENTS.PAGE_VIEW,
  attribution: {
    surfaces: [
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ],
    eventProperties: ['variantIdentity', 'platform', 'contentVariant'],
  },
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'content-variant',
  ],
  hypothesis:
    'A three-item Customers, Product, and Pricing nav with Log in and waitlist-first Get started converts more marketing visitors into waitlist starts than For/Tools flyouts plus Find yourself.',
  primaryMetric: 'waitlist_front_door_viewed / canonical_public_shell_exposed',
  guardrails: [
    'Keep Customers, Product, and Pricing as the only public center-nav labels.',
    'Do not restore For/Tools flyouts or Contact in the shared header.',
    'Header primary CTA follows getHomepageFrontDoorCtaContract; do not invent a second CTA.',
    'Do not persist search query text or inferred demographics in analytics properties.',
  ],
  privacyAndConsent:
    'Anonymous page analytics only. No sensitive demographic inference. No consent-gated identity stitching.',
  optimizerOwner: 'Product',
  cadence: 'weekly until a founder promote or rollback decision',
  decisionWriteback:
    'Keep this variant as control. Challengers require a new variantIdentity. Decisions write back on JOV-5745 and this contract.',
  rollbackOrControl:
    'Revert MarketingHeader and MARKETING_NAV_LINKS to Product/For/Tools/Pricing flyouts and restore MARKETING_NAV_UTILITIES Find yourself as the header CTA.',
} as const;
