import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { callTool, serveMcp, TOOLS } from './mcp.ts';
import { sampleResult } from './test-fixtures.ts';
import type { Wiring } from './wiring.ts';

function fakeWiring(calls: unknown[] = []): Wiring {
  return {
    gbrain: {} as Wiring['gbrain'],
    state: {} as Wiring['state'],
    judges: [],
    router: {
      research: async (req: unknown) => {
        calls.push(req);
        return sampleResult();
      },
    },
  } as unknown as Wiring;
}

async function roundTrip(wiring: Wiring, lines: string[]): Promise<string[]> {
  const input = new PassThrough();
  const out: string[] = [];
  const output = {
    write: (chunk: string) => {
      out.push(String(chunk));
      return true;
    },
  };
  const done = serveMcp(wiring, input, output);
  for (const line of lines) input.write(`${line}\n`);
  await new Promise(resolve => setImmediate(resolve));
  input.end();
  await done;
  return out.map(l => l.trim()).filter(Boolean);
}

describe('mcp serve', () => {
  it('answers initialize with a result carrying protocolVersion (tooling-health probe)', async () => {
    const [reply] = await roundTrip(fakeWiring(), [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'tooling-health', version: '1' },
        },
      }),
    ]);
    const msg = JSON.parse(reply);
    expect(msg.id).toBe(1);
    expect(msg.result.protocolVersion).toBe('2025-06-18');
    expect(msg.result.serverInfo.name).toBe('jovie-research');
    // The mac:tooling-health probe marks the tool green exactly when the
    // reply contains "result" and "protocolVersion".
    expect(reply).toContain('"result"');
    expect(reply).toContain('"protocolVersion"');
  });

  it('lists the research tool and requires a query', async () => {
    const [reply] = await roundTrip(fakeWiring(), [
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    ]);
    const msg = JSON.parse(reply);
    expect(msg.result.tools).toEqual(TOOLS);
    expect(TOOLS.map(t => t.name)).toEqual(['research']);
    expect(TOOLS[0].inputSchema.required).toEqual(['query']);
  });

  it('routes tools/call research through the router with mcp caller', async () => {
    const calls: unknown[] = [];
    const [reply] = await roundTrip(fakeWiring(calls), [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'research',
          arguments: {
            query: 'exa pricing',
            mode: 'quick',
            local_only: true,
          },
        },
      }),
    ]);
    const msg = JSON.parse(reply);
    expect(msg.result.content[0].type).toBe('text');
    expect(msg.result.content[0].text).toContain('https://exa.ai/pricing');
    expect(calls).toEqual([
      {
        query: 'exa pricing',
        freshness: undefined,
        mode: 'quick',
        social: false,
        localOnly: true,
        caller: 'mcp',
      },
    ]);
  });

  it('replies with an MCP error for unknown methods and tools', async () => {
    const [reply] = await roundTrip(fakeWiring(), [
      JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'bogus/method' }),
    ]);
    expect(JSON.parse(reply).error.code).toBe(-32601);
    await expect(callTool(fakeWiring(), 'nope', {})).rejects.toThrow(
      'unknown tool nope'
    );
  });

  it('answers ping and ignores notifications and malformed lines', async () => {
    const replies = await roundTrip(fakeWiring(), [
      'not json at all',
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' }),
    ]);
    expect(replies).toHaveLength(1);
    expect(JSON.parse(replies[0]).result).toEqual({});
  });
});
