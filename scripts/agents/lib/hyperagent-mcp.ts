/**
 * Read-only Hyperagent MCP client (JOV-6508).
 * Mirrors the OAuth/token flow of ~/.local/bin/hyperagent (same endpoints,
 * same token file) so the poller needs no interactive login when a valid
 * hat_ token already exists at ~/.config/hyperagent/mcp-oauth.json.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MCP_URL = 'https://hyperagent.com/api/mcp';
const TOKEN_URL = 'https://hyperagent.com/api/oauth/token';
const PROTOCOL = '2025-03-26';
export const HYPERAGENT_THREAD_URL = (id: string) =>
  `https://hyperagent.com/thread/${id}`;

function configDir(): string {
  return (
    process.env.HYPERAGENT_CONFIG_DIR ??
    join(homedir(), '.config', 'hyperagent')
  );
}

function tokenPath(): string {
  return (
    process.env.HYPERAGENT_MCP_TOKEN_FILE ?? join(configDir(), 'mcp-oauth.json')
  );
}

interface TokenBundle {
  access_token?: string;
  refresh_token?: string;
  client_id?: string;
  obtained_at?: number;
  expires_in?: number;
}

function isExpired(b: TokenBundle): boolean {
  if (!b.obtained_at || !b.expires_in) return false;
  return Date.now() >= (b.obtained_at + b.expires_in - 60) * 1000;
}

/** Refresh via OAuth refresh_token grant (same flow as the local CLI). */
async function refreshToken(bundle: TokenBundle): Promise<string | null> {
  const clientId =
    bundle.client_id ??
    (() => {
      try {
        return (
          JSON.parse(
            readFileSync(join(configDir(), 'mcp-oauth-client.json'), 'utf8')
          ) as { client_id?: string }
        ).client_id;
      } catch {
        return undefined;
      }
    })();
  if (!bundle.refresh_token || !clientId) return null;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: bundle.refresh_token,
      client_id: clientId,
      resource: MCP_URL,
    }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const tok = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
  };
  if (!tok.access_token) return null;
  const out = {
    token_type: tok.token_type ?? 'bearer',
    scope: tok.scope,
    expires_in: tok.expires_in,
    obtained_at: Math.floor(Date.now() / 1000),
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? bundle.refresh_token,
    client_id: clientId,
    resource: MCP_URL,
  };
  try {
    writeFileSync(tokenPath(), JSON.stringify(out), { mode: 0o600 });
  } catch {
    // best-effort persist; token still usable this run
  }
  return tok.access_token;
}

async function loadToken(): Promise<string | null> {
  // Prefer the token file: it self-refreshes via refresh_token, while
  // HYPERAGENT_MCP_TOKEN env snapshots (e.g. Doppler) rot within ~15 min.
  const p = tokenPath();
  if (existsSync(p)) {
    try {
      const bundle = JSON.parse(readFileSync(p, 'utf8')) as TokenBundle;
      if (bundle.access_token) {
        if (isExpired(bundle)) {
          const refreshed = await refreshToken(bundle);
          if (refreshed) return refreshed;
        } else {
          return bundle.access_token;
        }
      }
    } catch {
      // fall through to env token
    }
  }
  return process.env.HYPERAGENT_MCP_TOKEN ?? null;
}

export interface HyperagentThreadSummary {
  id: string;
  name: string;
  namedAgentId: string | null;
  invocationSource: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HyperagentMessage {
  id: string;
  role: string;
  content?: string;
  contentBlocks?: string;
  createdAt: string;
}

export class HyperagentClient {
  private sessionId: string | null = null;
  constructor(private token: string) {}

  static async create(): Promise<HyperagentClient | null> {
    const token = await loadToken();
    return token ? new HyperagentClient(token) : null;
  }

  private async rpc(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': PROTOCOL,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    if (!this.sessionId) {
      const init = await fetch(MCP_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL,
            capabilities: {},
            clientInfo: { name: 'jovie-run-ingest', version: '1.0.0' },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!init.ok)
        throw new Error(`hyperagent mcp initialize HTTP ${init.status}`);
      this.sessionId =
        init.headers.get('Mcp-Session-Id') ??
        init.headers.get('mcp-session-id');
      if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
      await init.arrayBuffer();
      await fetch(MCP_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => undefined);
    }

    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`hyperagent ${method} HTTP ${res.status}`);
    const body = (await res.json()) as {
      error?: unknown;
      result?: {
        isError?: boolean;
        content?: { type: string; text?: string }[];
      };
    };
    if (body.error) throw new Error(`hyperagent ${method} rpc error`);
    const result = body.result;
    if (!result || result.isError)
      throw new Error(`hyperagent ${method} tool error`);
    const text = result.content?.[0]?.text;
    if (typeof text === 'string' && text) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
    return result;
  }

  private callTool(name: string, args: Record<string, unknown>) {
    return this.rpc('tools/call', { name, arguments: args });
  }

  async listAgents(): Promise<
    { id: string; name: string; executionMode?: string }[]
  > {
    const r = (await this.callTool('list_agents', {})) as {
      agents?: { id: string; name: string; executionMode?: string }[];
    };
    return r.agents ?? [];
  }

  async *listThreads(limit = 100): AsyncGenerator<HyperagentThreadSummary> {
    let cursor: string | undefined;
    for (;;) {
      const r = (await this.callTool('list_threads', {
        limit,
        ...(cursor ? { cursor } : {}),
      })) as { threads?: HyperagentThreadSummary[]; nextCursor?: string };
      for (const t of r.threads ?? []) yield t;
      cursor = r.nextCursor;
      if (!cursor || !r.threads?.length) return;
    }
  }

  async getThread(
    threadId: string,
    messageLimit = 50
  ): Promise<{
    thread: HyperagentThreadSummary;
    messages: HyperagentMessage[];
    isRunning: boolean;
    awaitingApproval: boolean;
  }> {
    return (await this.callTool('get_thread', {
      threadId,
      messageLimit,
    })) as never;
  }
}

/**
 * Exact model string for a Hyperagent agent, when the agent name embeds it
 * (e.g. "GLM 5.3 Flash Developer" → glm-5.3-flash). Returns null when the
 * provider does not report a model — never guess.
 */
export function hyperagentModelForAgentName(
  agentName: string | null | undefined
): string | null {
  if (!agentName) return null;
  const m = agentName.match(/glm[\s-]?(\d+\.\d+)([\s-]?flash)?/i);
  if (m) return `glm-${m[1]}${m[2] ? '-flash' : ''}`;
  return null;
}
