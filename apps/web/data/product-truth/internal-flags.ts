import type { ProductFlagKey } from './registry';

/**
 * Internal rollout, vendor and measurement switches. None of them announces
 * a customer-facing capability.
 */
export const INTERNAL_FLAG_CAPABILITIES = {
  IN_HOUSE_RESOLVER: {
    nonMarketing:
      'legacy JOV-7323 umbrella rollback override for resolver families',
  },
  MUSICFETCH_FALLBACK: {
    nonMarketing: 'reversible JOV-7323 MusicFetch vendor-off switch',
  },
  MUSIC_RESOLVER_PROVIDER_LINKS: {
    nonMarketing: 'JOV-7323 provider-link resolver family cutover',
  },
  MUSIC_RESOLVER_RELEASE_FACTS: {
    nonMarketing: 'JOV-7323 release-facts resolver family cutover',
  },
} as const satisfies Readonly<
  Partial<Record<ProductFlagKey, { readonly nonMarketing: string }>>
>;
