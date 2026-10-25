import { z } from 'zod';
import {
  musicResolveOutputSchema,
  musicResolveSchema,
} from '@/lib/music-resolver/public-schemas';
import type {
  JsonSchema,
  OpenApiOperation,
  OpenApiResponse,
} from './v1/openapi';

const ref = (name: string): JsonSchema => ({
  $ref: `#/components/schemas/${name}`,
});
const text = (maxLength: number): JsonSchema => ({
  type: 'string',
  minLength: 1,
  maxLength,
  description: 'Whitespace is trimmed before validation.',
});
const nullableText: JsonSchema = { type: ['string', 'null'] };
const uri: JsonSchema = { type: 'string', format: 'uri' };
const noStore = {
  'Cache-Control': {
    description: 'Agent responses are not cached.',
    schema: { type: 'string', enum: ['no-store'] },
  },
};
const retryAfter = {
  'Retry-After': {
    description: 'Seconds to wait before retrying a temporary failure.',
    schema: { type: 'string' },
  },
};

function jsonResponse(
  description: string,
  schema: JsonSchema,
  retryable = false
): OpenApiResponse {
  return {
    description,
    headers: { ...noStore, ...(retryable ? retryAfter : {}) },
    content: { 'application/json': { schema } },
  };
}

function failure(description: string, ...codes: string[]): OpenApiResponse {
  return jsonResponse(
    `${description} Stable error.code is exposed as apiCode by the CLI/MCP.`,
    {
      type: 'object',
      required: ['error'],
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'string', enum: codes },
            message: { type: 'string' },
          },
        },
      },
    },
    codes.some(code =>
      [
        'FEATURE_DISABLED',
        'RATE_LIMITED',
        'SOURCE_RATE_LIMITED',
        'SOURCE_TIMEOUT',
        'TEMPORARILY_UNAVAILABLE',
      ].includes(code)
    )
  );
}

const body = (name: string) => ({
  required: true,
  content: { 'application/json': { schema: ref(name) } },
});

const guide = (summary: string, artist = false): OpenApiOperation => ({
  operationId: artist ? 'getArtistGuide' : 'getAgentGuide',
  summary,
  ...(artist
    ? {
        parameters: [
          {
            name: 'username',
            in: 'path' as const,
            required: true,
            description: 'Public Jovie profile handle.',
            schema: { type: 'string' },
          },
        ],
      }
    : {}),
  responses: {
    '200': {
      description: 'Machine-readable guide',
      content: { 'text/plain': { schema: { type: 'string' } } },
    },
  },
});

/** Public client resources; internal authenticated fleet actions have their own contract. */
export const PUBLIC_AGENT_PATHS: Readonly<
  Record<string, Partial<Record<'get' | 'post', OpenApiOperation>>>
> = {
  '/api/agents/creator-lookup': {
    get: {
      operationId: 'lookupCreator',
      summary: 'Find an existing profile or extract public creator fields',
      description:
        'Read-only, anonymous and rate limited by client IP. Accepts YouTube, Instagram, TikTok and Linktree profile URLs. Existing public profiles return exists=true and a Jovie profile URL. Only YouTube supports extraction when no existing profile matches; other sources return SOURCE_UNSUPPORTED. CLI platform:handle inputs are expanded to URLs before this request.',
      security: [],
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'HTTPS creator profile URL without credentials.',
          schema: { ...uri, maxLength: 2048 },
        },
      ],
      responses: {
        '200': jsonResponse('Existing profile or extracted creator', {
          oneOf: [ref('ExistingCreatorProfile'), ref('ExtractedCreator')],
        }),
        '400': failure('Missing or invalid URL.', 'VALIDATION_FAILED'),
        '404': failure('Creator not found.', 'CREATOR_NOT_FOUND'),
        '422': failure(
          'Unsupported URL or source extraction.',
          'SOURCE_UNSUPPORTED',
          'UNSUPPORTED_URL'
        ),
        '429': failure('Client IP quota exceeded.', 'RATE_LIMITED'),
        '502': failure(
          'Source extraction failed.',
          'LOOKUP_FAILED',
          'SOURCE_EMPTY',
          'SOURCE_LOGIN_WALL'
        ),
        '503': failure(
          'Source quota or lookup limiter temporarily unavailable.',
          'SOURCE_RATE_LIMITED',
          'TEMPORARILY_UNAVAILABLE'
        ),
        '504': failure('Source request timed out.', 'SOURCE_TIMEOUT'),
      },
    },
  },
  '/api/agents/feedback': {
    post: {
      operationId: 'reportAgentFeedback',
      summary: 'Submit a bug or feedback report',
      description:
        'Anonymous, rate limited by client IP. Returns a durable reportId. Only declared context fields are accepted; never send credentials, environment variables or file contents. Writes are not automatically retried by the CLI because they have no idempotency key.',
      security: [],
      requestBody: body('AgentFeedbackRequest'),
      responses: {
        '201': jsonResponse('Report saved', ref('AgentFeedbackResponse')),
        '400': failure('Invalid report or context.', 'VALIDATION_FAILED'),
        '429': failure('Client IP quota exceeded.', 'RATE_LIMITED'),
        '500': failure('Report could not be saved.', 'INTERNAL'),
      },
    },
  },
  '/api/agents/profiles': {
    post: {
      operationId: 'createProfile',
      summary: 'Create or find a Spotify artist profile',
      description:
        'Feature-gated. Anonymous callers are limited to 10 creations per hour per IP. An optional Bearer JOVIE_API_KEY attributes new profiles to the account and uses a shared 100-per-hour account budget. Credential verification is separately limited to 100 requests per minute per IP. API keys do not grant artist ownership. Supports Spotify artist URLs only. Returns an existing profile unchanged (200) or creates an unclaimed profile (201). claimUrl leads to human ownership verification and is null for claimed profiles. Writes have no idempotency key and are not automatically retried by the CLI.',
      security: [{}, { AgentApiKey: [] }],
      requestBody: body('AgentProfileRequest'),
      responses: {
        '200': jsonResponse('Existing profile', ref('AgentProfileResponse')),
        '201': jsonResponse(
          'New unclaimed profile',
          ref('AgentProfileResponse')
        ),
        '400': failure(
          'Invalid body or ingestion failure.',
          'CREATE_FAILED',
          'VALIDATION_FAILED'
        ),
        '401': failure('Invalid or expired API key.', 'UNAUTHORIZED'),
        '404': failure(
          'Spotify artist not found.',
          'ARTIST_NOT_FOUND',
          'CREATE_FAILED'
        ),
        '422': failure(
          'Unsupported artist URL.',
          'CREATE_FAILED',
          'UNSUPPORTED_URL'
        ),
        '429': failure(
          'Client IP or account quota exceeded.',
          'CREATE_FAILED',
          'RATE_LIMITED'
        ),
        '500': failure('Creation failed.', 'CREATE_FAILED', 'INTERNAL'),
        '503': failure(
          'Creation disabled or limiter unavailable.',
          'CREATE_FAILED',
          'FEATURE_DISABLED',
          'TEMPORARILY_UNAVAILABLE'
        ),
        default: failure(
          'Ingestion failure; HTTP status is forwarded from ingestion.',
          'CREATE_FAILED'
        ),
      },
    },
  },
  '/api/music/mcp': {
    post: {
      operationId: 'callPublicMusicTool',
      summary: 'Resolve public music through the stateless MCP transport',
      description:
        'Public read transport. The CLI calls tools/call with name=resolve, Accept: application/json, text/event-stream and Content-Type: application/json. tools/list advertises the complete resolve/search/fetch schemas. Both media types must be accepted; this server returns JSON. Domain errors are returned at HTTP 200 in result.structuredContent.error.code and become CLI apiCode. SDK JSON-RPC protocol errors use numeric error.code. An untrusted Origin is rejected with an empty 403. Body size is limited to 16384 bytes.',
      security: [],
      requestBody: body('MusicResolveRpcRequest'),
      responses: {
        '200': jsonResponse(
          'MCP tool result or JSON-RPC protocol error',
          ref('MusicResolveRpcResponse')
        ),
        '400': jsonResponse('Invalid JSON or request body', {
          oneOf: [ref('MusicHttpError'), ref('MusicParseError')],
        }),
        '403': {
          description: 'Origin not allowed; empty response body',
          content: {},
        },
        '406': {
          description:
            'MCP requires Accept: application/json, text/event-stream',
          content: {},
        },
        '408': jsonResponse('Body read timed out', ref('MusicHttpError')),
        '413': jsonResponse('Body exceeds 16384 bytes', ref('MusicParseError')),
        '429': jsonResponse(
          'Client IP quota exceeded',
          ref('MusicHttpError'),
          true
        ),
        '499': jsonResponse('Request cancelled', ref('MusicHttpError')),
        '503': jsonResponse('Limiter unavailable', ref('MusicHttpError'), true),
      },
    },
  },
  '/api/v1/openapi.json': {
    get: {
      operationId: 'getOpenApi',
      summary: 'Fetch this public OpenAPI contract',
      responses: {
        '200': {
          description: 'OpenAPI 3.1 document',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['openapi', 'paths', 'components'],
                additionalProperties: true,
              },
            },
          },
        },
      },
    },
  },
  '/llms-full.txt': {
    get: {
      ...guide('Read the complete agent guide'),
      operationId: 'getFullAgentGuide',
    },
  },
  '/llms.txt': { get: guide('Read the agent guide') },
  '/{username}/llms.txt': { get: guide('Read a public artist guide', true) },
};

export const PUBLIC_AGENT_SCHEMAS: Readonly<Record<string, JsonSchema>> = {
  AgentFeedbackContext: {
    type: 'object',
    additionalProperties: false,
    properties: {
      apiCode: text(60),
      channel: { type: 'string', enum: ['cli', 'mcp'] },
      cliVersion: text(40),
      command: text(120),
      exitCode: { type: 'integer', minimum: 0, maximum: 255 },
      platform: text(40),
      runId: text(80),
      runtime: text(40),
      scenario: text(120),
      status: { type: 'integer', minimum: 100, maximum: 599 },
    },
  },
  AgentFeedbackRequest: {
    type: 'object',
    required: ['kind', 'title', 'details'],
    properties: {
      kind: { type: 'string', enum: ['bug', 'feedback'] },
      title: text(200),
      details: text(4000),
      context: ref('AgentFeedbackContext'),
    },
  },
  AgentFeedbackResponse: {
    type: 'object',
    required: ['reportId'],
    properties: { reportId: { type: 'string' } },
  },
  AgentProfileRequest: {
    type: 'object',
    required: ['url'],
    properties: {
      url: { ...uri, maxLength: 500, description: 'Spotify artist URL.' },
    },
  },
  AgentProfileResponse: {
    type: 'object',
    required: [
      'username',
      'profileUrl',
      'claimUrl',
      'claimed',
      'public',
      'created',
    ],
    properties: {
      username: { type: 'string' },
      profileUrl: uri,
      claimUrl: { type: ['string', 'null'], format: 'uri' },
      claimed: { type: 'boolean' },
      public: { type: 'boolean' },
      created: { type: 'boolean' },
    },
  },
  CreatorSource: {
    type: 'string',
    enum: ['instagram', 'linktree', 'tiktok', 'youtube'],
  },
  ExistingCreatorProfile: {
    type: 'object',
    required: [
      'platform',
      'sourceUrl',
      'exists',
      'username',
      'displayName',
      'profileUrl',
    ],
    properties: {
      platform: ref('CreatorSource'),
      sourceUrl: uri,
      exists: { type: 'boolean', enum: [true] },
      username: { type: 'string' },
      displayName: nullableText,
      profileUrl: uri,
    },
  },
  ExtractedCreator: {
    type: 'object',
    required: [
      'platform',
      'sourceUrl',
      'exists',
      'displayName',
      'bio',
      'avatarUrl',
      'links',
    ],
    properties: {
      platform: ref('CreatorSource'),
      sourceUrl: uri,
      exists: { type: 'boolean', enum: [false] },
      displayName: nullableText,
      bio: nullableText,
      avatarUrl: { type: ['string', 'null'], format: 'uri' },
      links: {
        type: 'array',
        items: {
          type: 'object',
          required: ['url'],
          properties: {
            url: uri,
            platformId: { type: 'string' },
            title: { type: 'string' },
            sourcePlatform: { type: 'string' },
            evidence: {
              type: 'object',
              properties: {
                sources: { type: 'array', items: { type: 'string' } },
                signals: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
  MusicHttpError: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'retryable'],
        properties: {
          code: {
            type: 'string',
            enum: [
              'BODY_TIMEOUT',
              'CANCELLED',
              'INVALID_BODY',
              'RATE_LIMITED',
              'RATE_LIMIT_UNAVAILABLE',
            ],
          },
          retryable: { type: 'boolean' },
        },
      },
    },
  },
  MusicParseError: {
    type: 'object',
    required: ['error'],
    properties: { error: { type: 'string' }, details: { type: 'string' } },
  },
  MusicResolveInput: z.toJSONSchema(musicResolveSchema, {
    io: 'input',
  }) as JsonSchema,
  MusicResolveOutput: z.toJSONSchema(musicResolveOutputSchema) as JsonSchema,
  MusicResolveRpcRequest: {
    type: 'object',
    required: ['jsonrpc', 'id', 'method', 'params'],
    properties: {
      jsonrpc: { type: 'string', enum: ['2.0'] },
      id: { type: ['string', 'integer'] },
      method: { type: 'string', enum: ['tools/call'] },
      params: {
        type: 'object',
        required: ['name', 'arguments'],
        properties: {
          name: { type: 'string', enum: ['resolve'] },
          arguments: ref('MusicResolveInput'),
        },
      },
    },
  },
  MusicResolveRpcResponse: {
    type: 'object',
    required: ['jsonrpc', 'id'],
    properties: {
      jsonrpc: { type: 'string', enum: ['2.0'] },
      id: { type: ['string', 'integer', 'null'] },
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'integer' }, message: { type: 'string' } },
      },
      result: {
        type: 'object',
        required: ['content'],
        properties: {
          content: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'text'],
              properties: {
                type: { type: 'string', enum: ['text'] },
                text: { type: 'string' },
              },
            },
          },
          isError: { type: 'boolean' },
          structuredContent: {
            oneOf: [
              ref('MusicResolveOutput'),
              {
                type: 'object',
                required: ['error'],
                properties: {
                  error: {
                    type: 'object',
                    required: ['code', 'retryable'],
                    properties: {
                      code: {
                        type: 'string',
                        enum: [
                          'CANCELLED',
                          'INVALID_INPUT',
                          'UNKNOWN_TOOL',
                          'UPSTREAM_FAILURE',
                          'UPSTREAM_TIMEOUT',
                        ],
                      },
                      retryable: { type: 'boolean' },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
};
