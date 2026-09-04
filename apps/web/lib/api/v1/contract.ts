import { BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';

/** The public artist API's active semantic version. */
export const PUBLIC_ARTIST_API_VERSION = '1.0.0';

/** Canonical same-origin policy and lifecycle page for the active API. */
export const PUBLIC_ARTIST_API_POLICY_URL = `${BASE_URL}${APP_ROUTES.API_VERSIONING}`;

/**
 * Machine-readable lifecycle policy shared by the discovery index and OpenAPI
 * document. Active v1 intentionally has no deprecation or sunset signal.
 */
export const PUBLIC_ARTIST_API_VERSIONING_POLICY = {
  strategy: 'url',
  activeVersion: 'v1',
  additiveChanges: 'remain-within-active-version',
  breakingChanges: 'publish-a-new-url-version',
  policyUrl: PUBLIC_ARTIST_API_POLICY_URL,
  lifecycle: {
    deprecation: {
      header: 'Deprecation',
      standard: 'RFC 9745',
      active: false,
      trigger:
        'Only when a version is genuinely deprecated and migration guidance is published.',
    },
    sunset: {
      header: 'Sunset',
      standard: 'RFC 8594',
      active: false,
      trigger:
        'Only when a dated retirement window is announced for a deprecated version.',
    },
  },
} as const;

/** Structured-field policy identifier used by the public profile endpoint. */
export const PUBLIC_ARTIST_API_RATE_LIMIT_POLICY = 'public-artist';
export const PUBLIC_ARTIST_API_RATE_LIMIT = 100;
export const PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS = 60;
/**
 * Configured profile quota advertised when a request cannot read current
 * limiter state. This is policy only; remaining/reset fields are not implied.
 */
export const PUBLIC_ARTIST_API_RATE_LIMIT_POLICY_VALUE = `${JSON.stringify(
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY
)};q=${PUBLIC_ARTIST_API_RATE_LIMIT};w=${PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS}`;

export const PUBLIC_ARTIST_API_INDEX_URL = `${BASE_URL}/api/v1`;
export const PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL = `${BASE_URL}/api/v1/{username}`;
export const PUBLIC_ARTIST_API_OPENAPI_URL = `${BASE_URL}/api/v1/openapi.json`;
export const PUBLIC_ARTIST_API_DEVELOPERS_URL = `${BASE_URL}/developers`;
export const PUBLIC_ARTIST_API_SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

/** Canonical human-readable API reference. */
export const PUBLIC_ARTIST_API_REFERENCE_URL = `${DOCS_URL}/docs/api-reference`;

/**
 * RFC 9745 policy discovery link. It intentionally does not claim that v1 is
 * deprecated: the linked page documents the active version and future signal.
 */
export const PUBLIC_ARTIST_API_POLICY_LINK = `<${PUBLIC_ARTIST_API_POLICY_URL}>; rel="deprecation"; type="text/html"`;

/** Headers shared by public API discovery and profile responses. */
export const PUBLIC_ARTIST_API_COMMON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  Link: PUBLIC_ARTIST_API_POLICY_LINK,
} as const;

export const PUBLIC_ARTIST_API_DISCOVERY_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=86400';

export const PUBLIC_ARTIST_API_PROFILE_CACHE_CONTROL = 'private, no-store';

export interface PublicArtistApiIndex {
  readonly name: 'Jovie Artist API';
  readonly version: typeof PUBLIC_ARTIST_API_VERSION;
  readonly description: string;
  readonly access: 'anonymous';
  readonly scope: 'read-only';
  readonly methods: readonly ['GET'];
  readonly versioning: typeof PUBLIC_ARTIST_API_VERSIONING_POLICY;
  readonly rateLimit: {
    readonly appliesTo: 'artist-profile';
    readonly policy: typeof PUBLIC_ARTIST_API_RATE_LIMIT_POLICY;
    readonly limit: typeof PUBLIC_ARTIST_API_RATE_LIMIT;
    readonly windowSeconds: typeof PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS;
    readonly key: 'client-ip';
  };
  readonly endpoints: {
    readonly index: typeof PUBLIC_ARTIST_API_INDEX_URL;
    readonly artistTemplate: typeof PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL;
    readonly openapi: typeof PUBLIC_ARTIST_API_OPENAPI_URL;
    readonly developers: typeof PUBLIC_ARTIST_API_DEVELOPERS_URL;
    readonly sitemap: typeof PUBLIC_ARTIST_API_SITEMAP_URL;
  };
  readonly _links: {
    readonly self: typeof PUBLIC_ARTIST_API_INDEX_URL;
    readonly policy: typeof PUBLIC_ARTIST_API_POLICY_URL;
    readonly openapi: typeof PUBLIC_ARTIST_API_OPENAPI_URL;
    readonly developers: typeof PUBLIC_ARTIST_API_DEVELOPERS_URL;
    readonly sitemap: typeof PUBLIC_ARTIST_API_SITEMAP_URL;
  };
}

/**
 * Stable, non-enumerating capability document for scanners and agents.
 * It has no database dependency and therefore remains a truthful 200 surface
 * even when no particular artist handle is known or provisioned.
 */
export const PUBLIC_ARTIST_API_INDEX: PublicArtistApiIndex = {
  name: 'Jovie Artist API',
  version: PUBLIC_ARTIST_API_VERSION,
  description:
    'Anonymous, read-only JSON access to public Jovie artist profiles. This index advertises the supported contract without listing artist handles.',
  access: 'anonymous',
  scope: 'read-only',
  methods: ['GET'],
  versioning: PUBLIC_ARTIST_API_VERSIONING_POLICY,
  rateLimit: {
    appliesTo: 'artist-profile',
    policy: PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
    limit: PUBLIC_ARTIST_API_RATE_LIMIT,
    windowSeconds: PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
    key: 'client-ip',
  },
  endpoints: {
    index: PUBLIC_ARTIST_API_INDEX_URL,
    artistTemplate: PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL,
    openapi: PUBLIC_ARTIST_API_OPENAPI_URL,
    developers: PUBLIC_ARTIST_API_DEVELOPERS_URL,
    sitemap: PUBLIC_ARTIST_API_SITEMAP_URL,
  },
  _links: {
    self: PUBLIC_ARTIST_API_INDEX_URL,
    policy: PUBLIC_ARTIST_API_POLICY_URL,
    openapi: PUBLIC_ARTIST_API_OPENAPI_URL,
    developers: PUBLIC_ARTIST_API_DEVELOPERS_URL,
    sitemap: PUBLIC_ARTIST_API_SITEMAP_URL,
  },
};
