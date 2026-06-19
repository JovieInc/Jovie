import { NextResponse } from 'next/server';
import { BASE_URL } from '@/constants/app';

export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Jovie Artist API',
      version: '1.0.0',
      description:
        'Public read-only API for Jovie artist profiles. Returns artist bio, releases, tour events, and merch. Designed for AI agents and third-party integrations.',
      contact: { url: `${BASE_URL}/llms.txt` },
    },
    servers: [{ url: `${BASE_URL}/api/v1`, description: 'Production' }],
    paths: {
      '/{username}': {
        get: {
          operationId: 'getArtist',
          summary: 'Get artist profile with releases, events, and merch',
          parameters: [
            {
              name: 'username',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Artist username (e.g. "timwhite")',
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

  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
