import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import {
  PUBLIC_ARTIST_API_INDEX_URL,
  PUBLIC_ARTIST_API_OPENAPI_URL,
  PUBLIC_ARTIST_API_POLICY_LINK,
  PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL,
  PUBLIC_ARTIST_API_RATE_LIMIT,
  PUBLIC_ARTIST_API_RATE_LIMIT_POLICY,
  PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS,
  PUBLIC_ARTIST_API_REFERENCE_URL,
  PUBLIC_ARTIST_API_VERSION,
} from './contract';

type JsonSchema = {
  readonly type?: 'object' | 'array' | 'string' | 'integer' | 'boolean';
  readonly format?: string;
  readonly nullable?: boolean;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly enum?: readonly string[];
  readonly examples?: readonly (string | number | boolean)[];
  readonly $ref?: string;
};

type OpenApiResponse = {
  readonly description: string;
  readonly headers?: Readonly<Record<string, OpenApiHeader>>;
  readonly content: {
    readonly 'application/json': {
      readonly schema: JsonSchema;
    };
  };
};

type OpenApiHeader = {
  readonly description: string;
  readonly schema: JsonSchema;
  readonly example?: string;
};

const API_LIFECYCLE_HEADERS: Readonly<Record<string, OpenApiHeader>> = {
  Link: {
    description:
      'RFC 9745 deprecation-policy pointer. v1 is active; this relation advertises where future lifecycle signals will be documented.',
    schema: { type: 'string' },
    example: PUBLIC_ARTIST_API_POLICY_LINK,
  },
};

const API_RATE_LIMIT_HEADERS: Readonly<Record<string, OpenApiHeader>> = {
  'RateLimit-Policy': {
    description:
      'Current IETF HTTPAPI RateLimit draft policy: public-artist permits 100 requests in a 60-second window.',
    schema: { type: 'string' },
    example: '"public-artist";q=100;w=60',
  },
  RateLimit: {
    description:
      'Current IETF HTTPAPI RateLimit draft status for the caller, with remaining requests and seconds to reset.',
    schema: { type: 'string' },
    example: '"public-artist";r=99;t=60',
  },
  'X-RateLimit-Limit': {
    description: 'Legacy compatibility field for the request limit.',
    schema: { type: 'string' },
    example: String(PUBLIC_ARTIST_API_RATE_LIMIT),
  },
  'X-RateLimit-Remaining': {
    description: 'Legacy compatibility field for remaining requests.',
    schema: { type: 'string' },
    example: '99',
  },
  'X-RateLimit-Reset': {
    description: 'Legacy compatibility field containing the Unix reset time.',
    schema: { type: 'string' },
  },
};

const API_THROTTLED_HEADERS: Readonly<Record<string, OpenApiHeader>> = {
  ...API_LIFECYCLE_HEADERS,
  ...API_RATE_LIMIT_HEADERS,
  'Retry-After': {
    description:
      'Integer seconds before retrying. On a throttled response this is authoritative for retry timing.',
    schema: { type: 'string' },
    example: String(PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS),
  },
};

const API_PROFILE_HEADERS: Readonly<Record<string, OpenApiHeader>> = {
  ...API_LIFECYCLE_HEADERS,
  ...API_RATE_LIMIT_HEADERS,
};

const API_SERVICE_HEADERS: Readonly<Record<string, OpenApiHeader>> = {
  ...API_LIFECYCLE_HEADERS,
  'Retry-After': {
    description:
      'Integer seconds before retrying after a temporary rate-limit backend outage.',
    schema: { type: 'string' },
    example: '30',
  },
};

type OpenApiOperation = {
  readonly operationId: string;
  readonly summary: string;
  readonly description?: string;
  readonly parameters?: readonly OpenApiParameter[];
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
};

type OpenApiParameter = {
  readonly name: string;
  readonly in: 'header' | 'path' | 'query';
  readonly required: boolean;
  readonly schema: JsonSchema;
  readonly description: string;
};

/**
 * Machine-readable lifecycle policy for the active public API.
 *
 * The policy is intentionally descriptive: v1 is active, so its responses do
 * not carry Deprecation or Sunset headers. Those headers become applicable
 * only to a genuinely retired version after a dated migration decision.
 */
export const API_VERSIONING_POLICY = {
  strategy: 'url',
  activeVersion: 'v1',
  additiveChanges: 'remain-within-active-version',
  breakingChanges: 'publish-a-new-url-version',
  policyUrl: PUBLIC_ARTIST_API_REFERENCE_URL,
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

/**
 * Canonical OpenAPI 3.1 document for the public artist API.
 *
 * Served at both:
 * - `/api/v1/openapi.json` (canonical)
 * - `/openapi.json` (conventional discovery surface for agent scanners)
 *
 * One object owns the contract. Route handlers must not fork or duplicate it.
 */
export type ArtistOpenApiDocument = {
  readonly openapi: '3.1.0';
  readonly info: {
    readonly title: string;
    readonly version: string;
    readonly description: string;
    readonly contact: { readonly url: string };
  };
  readonly servers: readonly {
    readonly url: string;
    readonly description: string;
  }[];
  readonly externalDocs: {
    readonly description: string;
    readonly url: string;
  };
  readonly paths: Readonly<Record<string, { readonly get: OpenApiOperation }>>;
  readonly components: {
    readonly schemas: Readonly<Record<string, JsonSchema>>;
  };
  readonly 'x-jovie-versioning': typeof API_VERSIONING_POLICY;
};

export const ARTIST_OPENAPI_DOCUMENT: ArtistOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Jovie Artist API',
    version: '1.0.0',
    description:
      'Anonymous, read-only API for public Jovie artist profiles. The stable /api/v1 capability index is a machine-verifiable 200 surface; artist data is served by GET /api/v1/{username}. No API key, OAuth token, or write endpoint is required or supported. Versioning policy: URL-versioned /api/v1; additive changes remain in v1, breaking changes use a new URL version. Active v1 does not emit Deprecation or Sunset headers; RFC 9745 Deprecation and RFC 8594 Sunset apply only after a genuinely retired version has a dated migration policy.',
    contact: { url: `${BASE_URL}/llms.txt` },
  },
  servers: [{ url: BASE_URL, description: 'Production API origin' }],
  externalDocs: {
    description: 'API reference, rate limits, and version lifecycle policy',
    url: PUBLIC_ARTIST_API_REFERENCE_URL,
  },
  'x-jovie-versioning': API_VERSIONING_POLICY,
  paths: {
    '/api/v1': {
      get: {
        operationId: 'getArtistApiIndex',
        summary: 'Discover public artist API capabilities',
        description:
          'Stable, non-enumerating capability document. It identifies the anonymous read-only scope, supported GET resources, profile rate-limit metadata, and canonical discovery links without depending on a particular artist handle.',
        parameters: [
          {
            name: 'Accept',
            in: 'header',
            required: false,
            schema: { type: 'string', enum: ['application/json'] },
            description:
              'Optional standard media-type preference. This endpoint always returns its capability document as application/json.',
          },
        ],
        responses: {
          '200': {
            description: 'Public artist API capability document',
            headers: API_LIFECYCLE_HEADERS,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArtistApiIndex' },
              },
            },
          },
        },
      },
    },
    '/api/v1/{username}': {
      get: {
        operationId: 'getArtist',
        summary: 'Get artist profile with releases, events, and merch',
        description:
          'Anonymous read-only lookup for one public independent artist. Returns profile fields, releases, upcoming tour events, merch, and related resource links. The artist-profile bucket is limited by client IP. Responds 404 when the username is unknown or not public. Use the /api/v1 capability index or sitemap to discover a current handle; this contract does not enumerate artists.',
        parameters: [
          {
            name: 'username',
            in: 'path',
            required: true,
            schema: { type: 'string', examples: ['public-handle'] },
            description:
              'Current public Jovie artist handle. The generic example is intentionally not a provisioned profile.',
          },
        ],
        responses: {
          '200': {
            description: 'Artist data',
            headers: API_PROFILE_HEADERS,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArtistResponse' },
              },
            },
          },
          '404': {
            description: 'Artist not found',
            headers: API_PROFILE_HEADERS,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
          '429': {
            description: 'Artist-profile rate limit exceeded',
            headers: API_THROTTLED_HEADERS,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RateLimitError' },
              },
            },
          },
          '503': {
            description: 'Durable rate-limit service temporarily unavailable',
            headers: API_SERVICE_HEADERS,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ServiceUnavailable' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ArtistApiIndex: {
        type: 'object',
        required: [
          'name',
          'version',
          'description',
          'access',
          'scope',
          'methods',
          'rateLimit',
          'endpoints',
          '_links',
        ],
        properties: {
          name: { type: 'string', examples: ['Jovie Artist API'] },
          version: { type: 'string', examples: [PUBLIC_ARTIST_API_VERSION] },
          description: { type: 'string' },
          access: { type: 'string', enum: ['anonymous'] },
          scope: { type: 'string', enum: ['read-only'] },
          methods: {
            type: 'array',
            items: { type: 'string', enum: ['GET'] },
          },
          rateLimit: {
            type: 'object',
            required: ['appliesTo', 'policy', 'limit', 'windowSeconds', 'key'],
            properties: {
              appliesTo: { type: 'string', enum: ['artist-profile'] },
              policy: {
                type: 'string',
                examples: [PUBLIC_ARTIST_API_RATE_LIMIT_POLICY],
              },
              limit: {
                type: 'integer',
                examples: [PUBLIC_ARTIST_API_RATE_LIMIT],
              },
              windowSeconds: {
                type: 'integer',
                examples: [PUBLIC_ARTIST_API_RATE_LIMIT_WINDOW_SECONDS],
              },
              key: { type: 'string', examples: ['client-ip'] },
            },
          },
          endpoints: {
            type: 'object',
            required: [
              'index',
              'artistTemplate',
              'openapi',
              'developers',
              'sitemap',
            ],
            properties: {
              index: {
                type: 'string',
                format: 'uri',
                examples: [PUBLIC_ARTIST_API_INDEX_URL],
              },
              artistTemplate: {
                type: 'string',
                format: 'uri-template',
                examples: [PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL],
              },
              openapi: {
                type: 'string',
                format: 'uri',
                examples: [PUBLIC_ARTIST_API_OPENAPI_URL],
              },
              developers: { type: 'string', format: 'uri' },
              sitemap: { type: 'string', format: 'uri' },
            },
          },
          _links: {
            type: 'object',
            required: ['self', 'policy', 'openapi', 'developers', 'sitemap'],
            properties: {
              self: { type: 'string', format: 'uri' },
              policy: { type: 'string', format: 'uri' },
              openapi: { type: 'string', format: 'uri' },
              developers: { type: 'string', format: 'uri' },
              sitemap: { type: 'string', format: 'uri' },
            },
          },
        },
      },
      ArtistResponse: {
        type: 'object',
        required: ['artist', 'releases', 'events', 'merch', '_links'],
        properties: {
          artist: { $ref: '#/components/schemas/Artist' },
          releases: {
            type: 'array',
            items: { $ref: '#/components/schemas/Release' },
          },
          events: {
            type: 'array',
            items: { $ref: '#/components/schemas/Event' },
          },
          merch: {
            type: 'array',
            items: { $ref: '#/components/schemas/MerchItem' },
          },
          _links: { $ref: '#/components/schemas/Links' },
        },
      },
      Artist: {
        type: 'object',
        required: ['id', 'username', 'name', 'profileUrl'],
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          name: { type: 'string' },
          bio: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true },
          genres: { type: 'array', items: { type: 'string' } },
          avatarUrl: { type: 'string', nullable: true },
          profileUrl: { type: 'string', format: 'uri' },
          spotifyUrl: { type: 'string', format: 'uri', nullable: true },
          appleMusicUrl: { type: 'string', format: 'uri', nullable: true },
          youtubeUrl: { type: 'string', format: 'uri', nullable: true },
        },
      },
      Release: {
        type: 'object',
        required: ['id', 'title', 'url'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          type: {
            type: 'string',
            enum: ['single', 'ep', 'album', 'compilation'],
            nullable: true,
          },
          releaseDate: {
            type: 'string',
            format: 'date',
            nullable: true,
          },
          artworkUrl: { type: 'string', format: 'uri', nullable: true },
          url: { type: 'string', format: 'uri' },
        },
      },
      Event: {
        type: 'object',
        required: ['id', 'startDate', 'venue', 'city', 'country'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string', nullable: true },
          startDate: { type: 'string', format: 'date' },
          venue: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
          ticketUrl: { type: 'string', format: 'uri', nullable: true },
          ticketStatus: {
            type: 'string',
            enum: ['available', 'sold_out', 'cancelled'],
          },
        },
      },
      MerchItem: {
        type: 'object',
        required: ['id', 'title', 'productType', 'retailPriceCents', 'url'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          productType: { type: 'string' },
          imageUrl: { type: 'string', format: 'uri' },
          retailPriceCents: { type: 'integer' },
          url: { type: 'string', format: 'uri' },
          available: { type: 'boolean' },
        },
      },
      Links: {
        type: 'object',
        properties: {
          self: { type: 'string', format: 'uri' },
          profile: { type: 'string', format: 'uri' },
          llmsTxt: { type: 'string', format: 'uri' },
          feed: { type: 'string', format: 'uri' },
          mcp: { type: 'string', format: 'uri' },
          openapi: { type: 'string', format: 'uri' },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
        },
      },
      RateLimitError: {
        type: 'object',
        required: ['error', 'code'],
        properties: {
          error: { type: 'string', examples: ['Too many requests'] },
          code: { type: 'string', enum: ['RATE_LIMITED'] },
        },
      },
      ServiceUnavailable: {
        type: 'object',
        required: ['error', 'code'],
        properties: {
          error: { type: 'string' },
          code: { type: 'string', enum: ['RATE_LIMIT_UNAVAILABLE'] },
        },
      },
    },
  },
};

export const ARTIST_OPENAPI_CACHE_CONTROL = 'public, max-age=86400';

export function artistOpenApiGET(): NextResponse {
  return NextResponse.json(ARTIST_OPENAPI_DOCUMENT, {
    headers: {
      'Cache-Control': ARTIST_OPENAPI_CACHE_CONTROL,
      'Access-Control-Allow-Origin': '*',
      Link: PUBLIC_ARTIST_API_POLICY_LINK,
    },
  });
}
