import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';
import {
  PUBLIC_ARTIST_API_INDEX_URL,
  PUBLIC_ARTIST_API_OPENAPI_URL,
  PUBLIC_ARTIST_API_PROFILE_TEMPLATE_URL,
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
  readonly content: {
    readonly 'application/json': {
      readonly schema: JsonSchema;
    };
  };
};

type OpenApiOperation = {
  readonly operationId: string;
  readonly summary: string;
  readonly description?: string;
  readonly parameters?: readonly {
    readonly name: string;
    readonly in: 'path' | 'query';
    readonly required: boolean;
    readonly schema: JsonSchema;
    readonly description: string;
  }[];
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
};

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
};

export const ARTIST_OPENAPI_DOCUMENT: ArtistOpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Jovie Artist API',
    version: '1.0.0',
    description:
      'Anonymous, read-only API for public Jovie artist profiles. The stable /api/v1 capability index is a machine-verifiable 200 surface; artist data is served by GET /api/v1/{username}. No API key, OAuth token, or write endpoint is required or supported.',
    contact: { url: `${BASE_URL}/llms.txt` },
  },
  servers: [{ url: BASE_URL, description: 'Production API origin' }],
  externalDocs: {
    description: 'API reference',
    url: PUBLIC_ARTIST_API_REFERENCE_URL,
  },
  paths: {
    '/api/v1': {
      get: {
        operationId: 'getArtistApiIndex',
        summary: 'Discover public artist API capabilities',
        description:
          'Stable, non-enumerating capability document. It identifies the anonymous read-only scope, supported GET resources, and canonical discovery links without depending on a particular artist handle.',
        responses: {
          '200': {
            description: 'Public artist API capability document',
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
          'Anonymous read-only lookup for one public independent artist. Returns profile fields, releases, upcoming tour events, merch, and related resource links. Responds 404 when the username is unknown or not public. Use the /api/v1 capability index or sitemap to discover a current handle; this contract does not enumerate artists.',
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
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArtistResponse' },
              },
            },
          },
          '404': {
            description: 'Artist not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
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
            required: ['self', 'openapi', 'developers', 'sitemap'],
            properties: {
              self: { type: 'string', format: 'uri' },
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
    },
  });
}
