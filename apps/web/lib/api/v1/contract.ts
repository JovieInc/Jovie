import { BASE_URL } from '@/constants/app';
import { DOCS_URL } from '@/constants/domains';

/** The public artist API's active semantic version. */
export const PUBLIC_ARTIST_API_VERSION = '1.0.0';

export const PUBLIC_ARTIST_API_INDEX_URL = `${BASE_URL}/api/v1`;
export const PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL = `${BASE_URL}/api/v1/{username}`;
export const PUBLIC_ARTIST_API_OPENAPI_URL = `${BASE_URL}/api/v1/openapi.json`;
export const PUBLIC_ARTIST_API_DEVELOPERS_URL = `${BASE_URL}/developers`;
export const PUBLIC_ARTIST_API_SITEMAP_URL = `${BASE_URL}/sitemap.xml`;

/** Canonical human-readable API reference. */
export const PUBLIC_ARTIST_API_REFERENCE_URL = `${DOCS_URL}/docs/api-reference`;

/** Headers shared by public API discovery and profile responses. */
export const PUBLIC_ARTIST_API_COMMON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
} as const;

export const PUBLIC_ARTIST_API_DISCOVERY_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=86400';

export interface PublicArtistApiIndex {
  readonly name: 'Jovie Artist API';
  readonly version: typeof PUBLIC_ARTIST_API_VERSION;
  readonly description: string;
  readonly access: 'anonymous';
  readonly scope: 'read-only';
  readonly methods: readonly ['GET'];
  readonly endpoints: {
    readonly index: typeof PUBLIC_ARTIST_API_INDEX_URL;
    readonly artistTemplate: typeof PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL;
    readonly openapi: typeof PUBLIC_ARTIST_API_OPENAPI_URL;
    readonly developers: typeof PUBLIC_ARTIST_API_DEVELOPERS_URL;
    readonly sitemap: typeof PUBLIC_ARTIST_API_SITEMAP_URL;
  };
  readonly _links: {
    readonly self: typeof PUBLIC_ARTIST_API_INDEX_URL;
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
  endpoints: {
    index: PUBLIC_ARTIST_API_INDEX_URL,
    artistTemplate: PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL,
    openapi: PUBLIC_ARTIST_API_OPENAPI_URL,
    developers: PUBLIC_ARTIST_API_DEVELOPERS_URL,
    sitemap: PUBLIC_ARTIST_API_SITEMAP_URL,
  },
  _links: {
    self: PUBLIC_ARTIST_API_INDEX_URL,
    openapi: PUBLIC_ARTIST_API_OPENAPI_URL,
    developers: PUBLIC_ARTIST_API_DEVELOPERS_URL,
    sitemap: PUBLIC_ARTIST_API_SITEMAP_URL,
  },
};
