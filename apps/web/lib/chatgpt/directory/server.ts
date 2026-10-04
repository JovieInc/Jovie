import 'server-only';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { captureError } from '@/lib/error-tracking';
import {
  CHATGPT_DIRECTORY_INSTRUCTIONS,
  CHATGPT_DIRECTORY_TOOL_SPECS,
  findArtistOutputSchema,
  PUBLIC_ARTIST_TOOL_ANNOTATIONS,
  type PublicArtistProfile,
  type PublicArtistUpdates,
  publicArtistProfileSchema,
  publicArtistUpdatesSchema,
  subscribeToUpdatesResult,
  toolErrorSchema,
} from './contract';

export interface ArtistDirectoryReader {
  findArtists(query: string): Promise<PublicArtistProfile[]>;
  getArtist(username: string): Promise<PublicArtistProfile | null>;
  getUpdates(username: string): Promise<PublicArtistUpdates | null>;
}

function listedOutputSchema(schema: z.ZodType): {
  type: 'object';
  oneOf: [Record<string, unknown>, Record<string, unknown>];
} {
  return {
    type: 'object',
    oneOf: [
      z.toJSONSchema(schema, { target: 'draft-7' }),
      z.toJSONSchema(toolErrorSchema, { target: 'draft-7' }),
    ],
  };
}

function toolResult(result: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
    isError: 'error' in result,
  };
}

function invalidInput(): CallToolResult {
  return toolResult({ error: { code: 'INVALID_INPUT', retryable: false } });
}

function notFound(): CallToolResult {
  return toolResult({ error: { code: 'ARTIST_NOT_FOUND', retryable: false } });
}

export function createArtistDirectoryMcpServer(reader: ArtistDirectoryReader) {
  const server = new Server(
    { name: 'jovie-artists', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions: CHATGPT_DIRECTORY_INSTRUCTIONS,
    }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: CHATGPT_DIRECTORY_TOOL_SPECS.map(tool => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.input, { target: 'draft-7' }),
      outputSchema: listedOutputSchema(tool.output),
      annotations: PUBLIC_ARTIST_TOOL_ANNOTATIONS,
      securitySchemes: [{ type: 'noauth' }],
      _meta: { securitySchemes: [{ type: 'noauth' }] },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      if (params.name === 'find_artist') {
        const input = CHATGPT_DIRECTORY_TOOL_SPECS[0].input.safeParse(
          params.arguments
        );
        if (!input.success) return invalidInput();
        const profiles = await reader.findArtists(input.data.query);
        return toolResult(
          findArtistOutputSchema.parse({
            results: profiles.map(profile => ({
              username: profile.username,
              name: profile.name,
              profileUrl: profile.profileUrl,
              subscribeUrl: profile.subscribeUrl,
              match: 'candidate' as const,
            })),
          })
        );
      }
      if (params.name === 'get_profile') {
        const input = CHATGPT_DIRECTORY_TOOL_SPECS[1].input.safeParse(
          params.arguments
        );
        if (!input.success) return invalidInput();
        const profile = await reader.getArtist(input.data.username);
        if (!profile) return notFound();
        return toolResult(publicArtistProfileSchema.parse(profile));
      }
      if (params.name === 'get_updates') {
        const input = CHATGPT_DIRECTORY_TOOL_SPECS[2].input.safeParse(
          params.arguments
        );
        if (!input.success) return invalidInput();
        const updates = await reader.getUpdates(input.data.username);
        if (!updates) return notFound();
        return toolResult(publicArtistUpdatesSchema.parse(updates));
      }
      if (params.name === 'subscribe_to_updates') {
        const input = CHATGPT_DIRECTORY_TOOL_SPECS[3].input.safeParse(
          params.arguments
        );
        if (!input.success) return invalidInput();
        const profile = await reader.getArtist(input.data.username);
        if (!profile) return notFound();
        return toolResult(subscribeToUpdatesResult(profile));
      }
      return toolResult({ error: { code: 'UNKNOWN_TOOL', retryable: false } });
    } catch {
      await captureError(
        'ChatGPT artist directory read failed',
        new Error('Public artist directory read failure')
      );
      return toolResult({
        error: { code: 'UPSTREAM_FAILURE', retryable: true },
      });
    }
  });
  return server;
}
