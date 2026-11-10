import type { JsonSchema } from './v1/openapi';

const ref = (name: string): JsonSchema => ({
  $ref: `#/components/schemas/${name}`,
});

/**
 * The /api/music/mcp transport schemas, moved verbatim from
 * public-agent-openapi to keep that file inside the size-500 guard.
 */
export const MUSIC_RPC_OPENAPI_SCHEMAS: Readonly<Record<string, JsonSchema>> = {
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
