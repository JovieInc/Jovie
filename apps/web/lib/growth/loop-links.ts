/**
 * Tracked links for growth loops (canon/growth-loops.jsonl).
 *
 * The loop id is the attribution key: utm_campaign=<loop id> flows through the
 * first-touch capture onto the acquisition journey, so the per-loop funnel
 * groups by it. tests/unit/lib/growth/attribution-chain.test.ts pins these
 * constants to the registry, so a rename cannot silently break attribution.
 */

export const VIA_JOVIE_LOOP_ID = 'via-jovie-footer';
const VIA_JOVIE_UTM_SOURCE = 'via_jovie';

export type ViaJovieMedium = 'footer' | 'email_signature';

/** Query string (with leading ?) for a Via Jovie link in the given surface. */
export function viaJovieQuery(medium: ViaJovieMedium): string {
  const params = new URLSearchParams({
    utm_source: VIA_JOVIE_UTM_SOURCE,
    utm_medium: medium,
    utm_campaign: VIA_JOVIE_LOOP_ID,
  });
  return `?${params.toString()}`;
}

export function viaJovieHref(medium: ViaJovieMedium, path = '/'): string {
  return `${path}${viaJovieQuery(medium)}`;
}

/** App-safe counterpart of scripts/lib/growth-registry.mjs trackedLink. */
export function trackedLink(
  loop: {
    readonly id: string;
    readonly utmSource: string;
    readonly utmMedium: string;
  },
  url: string,
  { content }: { readonly content?: string } = {}
): string {
  const result = new URL(url);
  result.searchParams.set('utm_source', loop.utmSource);
  result.searchParams.set('utm_medium', loop.utmMedium);
  result.searchParams.set('utm_campaign', loop.id);
  if (content) result.searchParams.set('utm_content', content);
  return result.toString();
}

// Pinned to canon/growth-loops.jsonl by claim-url.test.ts, like Via Jovie above.
export const CLAIM_LINK_OUTREACH_LOOP = {
  id: 'claim-link-outreach',
  utmSource: 'claim_link',
  utmMedium: 'dm',
} as const;
