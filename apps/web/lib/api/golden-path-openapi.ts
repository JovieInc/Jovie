import { z } from 'zod';
import {
  answerQuestionSchema,
  claimHandleSchema,
  draftRefSchema,
  GOLDEN_PATH_TOOL_NAMES,
  publishProfileSchema,
  shareProfileSchema,
} from '@/lib/agent-acquisition/golden-path';
import type { JsonSchema, OpenApiResponse } from './v1/openapi';

/**
 * Golden-path OpenAPI publication (founder order 2026-11-09): the seven
 * /api/mcp tools the CLI calls. Kept out of public-agent-openapi.ts so that
 * file stays inside the size-500 guard; spread into PUBLIC_AGENT_PATHS and
 * PUBLIC_AGENT_SCHEMAS.
 */

const ref = (name: string): JsonSchema => ({
  $ref: `#/components/schemas/${name}`,
});
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

export const GOLDEN_PATH_OPENAPI_PATHS = {
  '/api/mcp': {
    post: {
      operationId: 'callGoldenPathTool',
      summary: 'Golden-path agent tools over the drafts MCP transport',
      description:
        'Write transport for the golden path (claim, Mom Test, qualification, setup, publish routing, share, upgrade). Every call is guarded by origin, feature flag and the agent write rate limiter; draft-scoped writes require the private HMAC draft_token from artist.search_or_import / workspace.create_draft. The token never appears in a URL and must never be shared. Tools never claim ownership, publish, or purchase: publish_profile routes the person to claim_url, and start_upgrade returns the existing /claim/start checkout entry where offer truth renders. Domain errors return HTTP 200 with result.structuredContent.status = error and a stable code (DRAFT_UNAVAILABLE, INVALID_INPUT); unknown tools use JSON-RPC -32602. Body size is limited to 16384 bytes and an untrusted Origin is rejected with 403.',
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: ref('GoldenPathRpcRequest') },
        },
      },
      responses: {
        '200': jsonResponse(
          'MCP tool result or JSON-RPC protocol error',
          ref('GoldenPathRpcResponse')
        ),
        '400': jsonResponse(
          'Invalid JSON or request body',
          ref('GoldenPathHttpError')
        ),
        '403': {
          description: 'Origin not allowed; empty response body',
          content: {},
        },
        '429': jsonResponse(
          'Agent write quota exceeded',
          ref('GoldenPathHttpError'),
          true
        ),
        '503': jsonResponse(
          'Feature disabled or limiter unavailable',
          ref('GoldenPathHttpError'),
          true
        ),
      },
    },
  },
} as const;

export const GOLDEN_PATH_OPENAPI_SCHEMAS: Readonly<Record<string, JsonSchema>> =
  {
    GoldenPathRpcRequest: z.toJSONSchema(
      z.object({
        jsonrpc: z.literal('2.0'),
        id: z.union([z.string().max(200), z.number().finite()]),
        method: z.literal('tools/call'),
        params: z.object({
          name: z.enum(GOLDEN_PATH_TOOL_NAMES),
          arguments: z.union([
            claimHandleSchema,
            answerQuestionSchema,
            draftRefSchema,
            publishProfileSchema,
            shareProfileSchema,
          ]),
        }),
      })
    ) as JsonSchema,
    GoldenPathRpcResponse: {
      type: 'object',
      required: ['jsonrpc', 'id'],
      properties: {
        jsonrpc: { type: 'string', enum: ['2.0'] },
        id: { type: ['string', 'integer', 'null'] },
        error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'integer' },
            message: { type: 'string' },
          },
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
            structuredContent: { type: 'object' },
          },
        },
      },
    },
    GoldenPathHttpError: {
      type: 'object',
      required: ['error'],
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: {
              type: 'string',
              enum: [
                'FEATURE_DISABLED',
                'INVALID_RESPONSE',
                'RATE_LIMITED',
                'TEMPORARILY_UNAVAILABLE',
              ],
            },
            message: { type: 'string' },
          },
        },
      },
    },
  };
