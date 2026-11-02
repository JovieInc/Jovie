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
