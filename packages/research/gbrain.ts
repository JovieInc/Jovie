/**
 * gbrain over the shared loopback MCP daemon (the same one the stdio proxy
 * in ~/.gbrain/bin uses). One HTTP round trip per call, ~1-4s, versus
 * 20-45s for a cold `gbrain call` CLI process. Local, not a third-party API.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parseMcpBody } from './mcp-wire.ts';

export interface GbrainClient {
  call<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T>;
}

export class GbrainUnavailable extends Error {
  constructor(message: string) {
    super(`gbrain-unavailable: ${message}`);
    this.name = 'GbrainUnavailable';
  }
}

function readToken(env: NodeJS.ProcessEnv): string | null {
  const candidates = [
    env.GBRAIN_MCP_TOKEN_FILE,
    join(homedir(), '.gbrain', 'agent-tokens', 'claude.token'),
    join(homedir(), '.gbrain', 'agent-tokens', 'codex.token'),
  ].filter((p): p is string => Boolean(p));
  for (const path of candidates) {
    try {
      const token = readFileSync(path, 'utf8').trim();
      if (token) return token;
    } catch {
      // try the next token file
    }
  }
  return null;
}

export function createGbrainClient(
  options: {
    url?: string;
    token?: string | null;
    timeoutMs?: number;
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {}
): GbrainClient {
  const env = options.env ?? process.env;
  const url = options.url ?? env.GBRAIN_MCP_URL ?? 'http://127.0.0.1:7801/mcp';
  const token = options.token === undefined ? readToken(env) : options.token;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let id = 0;
  return {
    async call<T>(tool: string, args: Record<string, unknown>): Promise<T> {
      if (!token) throw new GbrainUnavailable('no agent token');
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: ++id,
            method: 'tools/call',
            params: { name: tool, arguments: args },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new GbrainUnavailable((error as Error).message);
      }
      if (!response.ok) {
        throw new GbrainUnavailable(`HTTP ${response.status}`);
      }
      try {
        return parseMcpBody(
          await response.text(),
          response.headers.get('content-type') ?? ''
        ) as T;
      } catch (error) {
        if ((error as Error).message === 'mcp: empty response')
          throw new GbrainUnavailable('empty response');
        throw error;
      }
    },
  };
}

export interface GbrainHit {
  slug: string;
  title?: string;
  type?: string;
  chunk_text?: string;
  score?: number;
  effective_date?: string;
  status?: string;
}
