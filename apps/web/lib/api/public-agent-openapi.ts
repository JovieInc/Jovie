import { z } from 'zod';
import {
  musicResolveFailureSchema,
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

function musicResolveResponse(
  description: string,
  schema: string,
  retryable = false
): OpenApiResponse {
  const response = jsonResponse(description, ref(schema), retryable);
  return {
    ...response,
    headers: {
      ...response.headers,
      Link: {
        description: 'Active v1 lifecycle policy pointer.',
        schema: { type: 'string' },
      },
      'RateLimit-Policy': {
        description:
          'Shared public-artist IP quota: 100 requests per 60 seconds.',
        schema: { type: 'string' },
      },
      RateLimit: {
        description: 'Remaining requests and seconds to reset when available.',
        schema: { type: 'string' },
      },
      'X-Request-Id': {
        description:
          'Server-generated request identifier; supplied IDs are ignored.',
        schema: { type: 'string', format: 'uuid' },
      },
    },
  };
}

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
        'Anonymous, feature-gated and rate limited by client IP. Supports Spotify artist URLs only. Returns an existing profile unchanged (200) or creates an unclaimed profile (201). claimUrl leads to human ownership verification and is null for claimed profiles. Writes have no idempotency key and are not automatically retried by the CLI.',
      security: [],
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
          'Client IP quota exceeded.',
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
  '/api/v1/music/resolve': {
    post: {
      operationId: 'resolvePublicMusicV1',
      summary: 'Resolve public artist, track or album identity',
      description:
        'Anonymous read-only music capability, using exactly the MCP resolve schema and resolver. No tenant data, profile creation, claims, publishing or charges. Artist input accepts a name, MusicBrainz artist ID or supported artist HTTPS URL. Track input accepts a URL, ISRC or title with artist; album input accepts a URL, UPC or title with artist. Territory applies to tracks/albums only. Ambiguity returns real candidates; resubmit the selected candidate URL. no_match and ambiguous are successful domain outcomes. Aggregate confidence is legacy heuristic evidence, not calibrated assurance. Canonical persisted revisions, history, batch/jobs, freshness/field selection, spend authorization and tenant credentials are not supported by this resource; unknown request fields are rejected. Body limit is 16384 bytes, body deadline 5 seconds and provider deadline 45 seconds. Disconnect cancellation aborts provider work. Read retries may repeat upstream work; no durable replay snapshot is promised. Unknown Origin is denied. Response facts and errors match MCP structuredContent; REST additionally maps failures to HTTP statuses. This is not vendor compatibility or full parity certification.',
      security: [],
      requestBody: body('MusicResolveInput'),
      responses: {
        '200': musicResolveResponse(
          'Resolved, ambiguous or no match',
          'MusicResolveOutput'
        ),
        '400': musicResolveResponse(
          'Invalid JSON, input or unsupported fields',
          'MusicResolveFailure'
        ),
        '403': musicResolveResponse(
          'Origin not allowed',
          'MusicResolveFailure'
        ),
        '408': musicResolveResponse(
          'Body read timed out',
          'MusicResolveFailure',
          true
        ),
        '413': musicResolveResponse(
          'Body exceeds 16384 bytes',
          'MusicResolveFailure'
        ),
        '415': musicResolveResponse(
          'Content-Type must be application/json',
          'MusicResolveFailure'
        ),
        '429': musicResolveResponse(
          'Client IP quota exceeded',
          'MusicResolveFailure',
          true
        ),
        '499': musicResolveResponse('Request cancelled', 'MusicResolveFailure'),
        '502': musicResolveResponse(
          'Provider failed or returned invalid data',
          'MusicResolveFailure',
          true
        ),
        '503': musicResolveResponse(
          'Quota store unavailable',
          'MusicResolveFailure',
          true
        ),
        '504': musicResolveResponse(
          'Provider deadline exceeded',
          'MusicResolveFailure',
          true
        ),
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
  MusicResolveFailure: z.toJSONSchema(musicResolveFailureSchema) as JsonSchema,
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
