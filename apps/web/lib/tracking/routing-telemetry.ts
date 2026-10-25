import {
  localizeProviderUrl,
  readVisitorCountryCookie,
} from '@/lib/discography/storefront';

/**
 * Privacy-safe smart-link routing telemetry. Opaque per-click id plus
 * country-level fields only: no IP, user agent, fingerprint or city.
 */
export interface RoutingTelemetry {
  /** Random per-click id, not derived from or linked to the visitor. */
  readonly clickId: string;
  /** ms from navigation start to the routing decision (click or auto-redirect). */
  readonly ttdMs: number;
  /** Apple Music storefront actually chosen, when the provider has one. */
  readonly storefront?: string;
  /** Visitor country (ISO alpha-2, lowercase) from the platform-geo cookie. */
  readonly visitorCountry?: string;
}

const APPLE_STOREFRONT_IN_URL =
  /^https:\/\/(?:geo\.)?music\.apple\.com\/([a-z]{2})\//i;

export function newClickId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function storefrontOfUrl(url: string): string | undefined {
  return APPLE_STOREFRONT_IN_URL.exec(url)?.[1]?.toLowerCase();
}

export function buildRoutingTelemetry(input: {
  readonly providerId: string;
  /** Stored (unlocalized) provider URL. */
  readonly url: string;
}): { telemetry: RoutingTelemetry; url: string } {
  const country = readVisitorCountryCookie();
  const url = localizeProviderUrl(input.providerId, input.url, country);
  const now =
    typeof performance === 'undefined' ? 0 : Math.round(performance.now());
  return {
    url,
    telemetry: {
      clickId: newClickId(),
      ttdMs: now,
      ...(input.providerId === 'apple_music' && storefrontOfUrl(url)
        ? { storefront: storefrontOfUrl(url) }
        : {}),
      ...(country ? { visitorCountry: country } : {}),
    },
  };
}
