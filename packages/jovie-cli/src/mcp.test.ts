import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import type { FetchImplementation } from './client.js';
import { handleMcpMessage, serveMcp } from './mcp.js';

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

  it('returns text results and API failure details', async () => {
    const text: FetchImplementation = async () => new Response('# docs');
    await expect(
      handleMcpMessage(
        {
          id: 8,
          method: 'tools/call',
          params: { name: 'get_docs', arguments: { full: true } },
        },
        context(text)
      )
    ).resolves.toMatchObject({
      result: { content: [{ type: 'text', text: '# docs' }] },
    });

    const limited: FetchImplementation = async () =>
      new Response('{"error":{"code":"RATE_LIMITED"}}', {
        status: 429,
        headers: { 'Retry-After': '30' },
      });
    const failed = await handleMcpMessage(
      {
        id: 9,
        method: 'tools/call',
        params: { name: 'get_artist', arguments: { username: 'demo' } },
      },
      context(limited)
    );
    const error = JSON.parse(
      (failed?.result as { content: Array<{ text: string }> }).content[0].text
    ).error;
    expect(error).toMatchObject({
      code: 'REQUEST_FAILED',
      apiCode: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 30,
    });

    const missingArgs = await handleMcpMessage(
      { id: 10, method: 'tools/call', params: { name: 'get_artist' } },
      context()
    );
    expect(missingArgs?.result).toMatchObject({ isError: true });
  });

  it('serves newline JSON, skipping blanks and reporting parse errors', async () => {
    let output = '';
    await serveMcp(
      Readable.from([
        '\n',
        'not json\n',
        '{"method":"notifications/x"}\n',
        '{"id":1,"method":"ping"}\n',
      ]),
      { write: chunk => (output += chunk) },
      context()
    );
    const lines = output
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    expect(lines).toEqual([
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      },
      { jsonrpc: '2.0', id: 1, result: {} },
    ]);
  });

  it('exposes report tools with required title/details and files over mcp', async () => {
    const list = await handleMcpMessage(
      { id: 20, method: 'tools/list' },
      context()
    );
    const tool = (
      list?.result as {
        tools: Array<{ name: string; inputSchema: { required?: string[] } }>;
      }
    ).tools.find(entry => entry.name === 'report_issue');
    expect(tool?.inputSchema.required).toEqual(['title', 'details']);

    let body: Record<string, unknown> = {};
    const fetchImpl: FetchImplementation = async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response('{"reportId":"r-2"}', { status: 201 });
    };
    const response = await handleMcpMessage(
      {
        id: 21,
        method: 'tools/call',
        params: {
          name: 'report_feedback',
          arguments: {
            title: 'confusing',
            details: 'claim step unclear',
            scenario: 7,
          },
        },
      },
      context(fetchImpl)
    );
    expect(response?.result).toMatchObject({
      structuredContent: { reportId: 'r-2' },
    });
    expect(body).toMatchObject({
      kind: 'feedback',
      context: { channel: 'mcp', cliVersion: '1.2.3' },
    });
    expect((body.context as Record<string, unknown>).scenario).toBeUndefined();
  });
});
