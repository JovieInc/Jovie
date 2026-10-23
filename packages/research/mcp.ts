/**
 * Minimal MCP stdio server (newline-delimited JSON-RPC) exposing the router
 * and decision log as tools. No SDK dependency: four tools, one transport.
 */
import { createInterface } from 'node:readline';

import {
  findDecisions,
  proposeReviews,
  type TriggerKind,
} from './decisions.ts';
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
  {
    name: 'decision_find',
    description:
      'Find recorded decisions on a topic before changing anything they cover.',
    inputSchema: {
      type: 'object',
      properties: { topic: str },
      required: ['topic'],
    },
  },
  {
    name: 'decision_trigger',
    description:
      'A new model, tool, price or data point may invalidate old decisions: propose linked review pages (never overwrites). dry_run lists matches only.',
    inputSchema: {
      type: 'object',
      properties: {
        trigger: str,
        kind: {
          type: 'string',
          enum: ['model', 'tool', 'data', 'price', 'incident', 'other'],
        },
        topic: str,
        evidence: { type: 'array', items: str },
        dry_run: { type: 'boolean' },
      },
      required: ['trigger', 'kind'],
    },
  },
] as const;

type Args = Record<string, unknown>;

export async function callTool(
  wiring: Wiring,
  name: string,
  args: Args
): Promise<string> {
  switch (name) {
    case 'research': {
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
    case 'decision_find': {
      const rows = await findDecisions(wiring.gbrain, String(args.topic));
      return (
        rows
          .map(r => `${r.slug} (${r.status ?? 'unknown'}): ${r.title ?? ''}`)
          .join('\n') || 'No decisions found.'
      );
    }
    case 'decision_trigger': {
      const rows = await proposeReviews(wiring.gbrain, {
        trigger: String(args.trigger),
        kind: (args.kind as TriggerKind) ?? 'other',
        topic: typeof args.topic === 'string' ? args.topic : undefined,
        evidence: Array.isArray(args.evidence) ? args.evidence.map(String) : [],
        dryRun: args.dry_run === true,
      });
      return (
        rows
          .map(
            r =>
              `${r.decision} -> ${r.review ?? '(dry run)'} score=${r.score.toFixed(2)}`
          )
          .join('\n') || 'No decisions matched.'
      );
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
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
