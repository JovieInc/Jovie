import { describe, expect, it } from 'vitest';

import type { FetchImplementation } from './client.js';
import { handleMcpMessage } from './mcp.js';

function context(fetchImpl?: FetchImplementation) {
  return { version: '1.2.3', baseUrl: 'https://jov.ie', fetchImpl };
}

describe('MCP server', () => {
  it('negotiates the protocol version and advertises tools', async () => {
    const init = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      },
      context()
    );
    expect(init).toMatchObject({
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'jovie', version: '1.2.3' },
      },
    });

    const unknownVersion = await handleMcpMessage(
      {
        id: 2,
        method: 'initialize',
        params: { protocolVersion: '1999-01-01' },
      },
      context()
    );
    expect(unknownVersion?.result).toMatchObject({
      protocolVersion: '2025-11-25',
    });
  });

  it('ignores notifications and rejects unknown methods', async () => {
    await expect(
      handleMcpMessage({ method: 'notifications/initialized' }, context())
    ).resolves.toBeNull();
    await expect(
      handleMcpMessage({ id: 3, method: 'resources/list' }, context())
    ).resolves.toMatchObject({ error: { code: -32601 } });
  });

  it('lists create_profile as a non-read-only tool with a required url', async () => {
    const response = await handleMcpMessage(
      { id: 4, method: 'tools/list' },
      context()
    );
    const tools = (
      response?.result as {
        tools: Array<{
          name: string;
          inputSchema: { required?: string[] };
          annotations: { readOnlyHint: boolean };
        }>;
      }
    ).tools;
    const create = tools.find(tool => tool.name === 'create_profile');
    expect(create?.inputSchema.required).toEqual(['url']);
    expect(create?.annotations.readOnlyHint).toBe(false);
    expect(
      tools.find(tool => tool.name === 'get_artist')?.annotations
    ).toMatchObject({ readOnlyHint: true });
  });

  it('calls a tool and returns structured content', async () => {
    const urls: string[] = [];
    const fetchImpl: FetchImplementation = async (input, init) => {
      urls.push(`${init?.method} ${String(input)}`);
      return new Response('{"username":"demo"}', { status: 201 });
    };
    const response = await handleMcpMessage(
      {
        id: 5,
        method: 'tools/call',
        params: {
          name: 'create_profile',
          arguments: { url: 'https://open.spotify.com/artist/abc' },
        },
      },
      context(fetchImpl)
    );
    expect(urls).toEqual(['POST https://jov.ie/api/agents/profiles']);
    expect(response?.result).toEqual({
      content: [{ type: 'text', text: '{"username":"demo"}' }],
      structuredContent: { username: 'demo' },
    });
  });

  it('returns tool failures as isError results with a stable code', async () => {
    const response = await handleMcpMessage(
      {
        id: 6,
        method: 'tools/call',
        params: { name: 'create_profile', arguments: { url: 'nope' } },
      },
      context()
    );
    const result = response?.result as {
      isError: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error.code).toBe('INVALID_INPUT');

    const unknown = await handleMcpMessage(
      { id: 7, method: 'tools/call', params: { name: 'nope' } },
      context()
    );
    expect(unknown?.result).toMatchObject({ isError: true });
  });
});
