/**
 * Minimal MCP stdio server (newline-delimited JSON-RPC) exposing the research
 * router as a tool. No SDK dependency: one tool, one transport.
 *
 * The tooling-health probe (`mac:tooling-health`, jovie-research-mcp) keeps this
 * entry point green with an `initialize` round trip through the same command
 * Claude Code launches: `jovie-research mcp`.
 */
import { createInterface } from 'node:readline';

import { renderResult } from './report.ts';
import type { Freshness, Mode } from './types.ts';
import type { Wiring } from './wiring.ts';

const str = { type: 'string' } as const;

export const TOOLS = [
  {
    name: 'research',
    description:
      'Answer a research question through the shared Jovie research router: cache, then gbrain + repo docs, then credit/free web sources, then paid search, judged after each tier. Use this instead of calling Exa/Firecrawl/web search directly.',
    inputSchema: {
      type: 'object',
      properties: {
        query: str,
        freshness: {
          type: 'string',
          enum: ['live', 'day', 'week', 'month', 'evergreen'],
        },
        mode: { type: 'string', enum: ['quick', 'standard', 'deep'] },
        social: { type: 'boolean' },
        local_only: { type: 'boolean' },
        caller: str,
      },
      required: ['query'],
    },
  },
] as const;

type Args = Record<string, unknown>;

export async function callTool(
  wiring: Wiring,
  name: string,
  args: Args
): Promise<string> {
  if (name !== 'research') throw new Error(`unknown tool ${name}`);
  const result = await wiring.router.research({
    query: String(args.query),
    freshness: args.freshness as Freshness | undefined,
    mode: args.mode as Mode | undefined,
    social: args.social === true,
    localOnly: args.local_only === true,
    caller: typeof args.caller === 'string' ? args.caller : 'mcp',
  });
  return renderResult(result);
}

export function serveMcp(
  wiring: Wiring,
  input: NodeJS.ReadableStream = process.stdin,
  output: { write(chunk: string): unknown } = process.stdout
): Promise<void> {
  const send = (msg: unknown) => output.write(`${JSON.stringify(msg)}\n`);
  const rl = createInterface({ input });
  rl.on('line', async line => {
    if (!line.trim()) return;
    let msg: {
      id?: number | string;
      method?: string;
      params?: { name?: string; arguments?: Args };
    };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === undefined) return;
    try {
      if (msg.method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'jovie-research', version: '1.0.0' },
          },
        });
      } else if (msg.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
      } else if (msg.method === 'tools/call') {
        const text = await callTool(
          wiring,
          String(msg.params?.name),
          msg.params?.arguments ?? {}
        );
        send({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text }] },
        });
      } else if (msg.method === 'ping') {
        send({ jsonrpc: '2.0', id: msg.id, result: {} });
      } else {
        send({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32601, message: `unknown method ${msg.method}` },
        });
      }
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          isError: true,
          content: [{ type: 'text', text: (error as Error).message }],
        },
      });
    }
  });
  return new Promise(resolve => rl.on('close', () => resolve()));
}
