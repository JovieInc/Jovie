/**
 * Tier 1 (credits / free plan) and tier 2 (paid) sources. Every HTTP call
 * goes through @jovie/api-client so it shares the host budget ledger,
 * breaker and retry policy with the rest of the fleet.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { ApiClient } from '@jovie/api-client';

import { cloudflareAccount } from './credentials.ts';
import { parseMcpBody } from './mcp-wire.ts';
import type { Freshness, Hit } from './types.ts';

const run = promisify(execFile);

export interface SourceOutput {
  hits: Hit[];
  /** Provider-reported USD when available, else undefined (estimate stands). */
  usd?: number;
  answer?: string;
}

const READ = { write: false, idempotent: true } as const;

const DAYS: Record<Freshness, number | null> = {
  live: 1,
  day: 2,
  week: 8,
  month: 45,
  evergreen: null,
};

function sinceIso(freshness: Freshness, now = Date.now()): string | null {
  const days = DAYS[freshness];
  return days === null ? null : new Date(now - days * 86_400_000).toISOString();
}

/** Collapse whitespace and markdown link/image syntax so snippets stay cheap to read. */
export const clip = (text: unknown, n: number) =>
  typeof text === 'string'
    ? text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[|#*\\\u200b]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, n)
    : '';

// ---- Exa (paid, tier 2) ---------------------------------------------------

interface ExaResult {
  title?: string;
  url: string;
  publishedDate?: string;
  highlights?: string[];
  summary?: string;
  text?: string;
}

export async function exaSearch(
  client: ApiClient,
  query: string,
  freshness: Freshness,
  numResults = 8
): Promise<SourceOutput> {
  const since = sinceIso(freshness);
  const response = await client.request({
    url: 'https://api.exa.ai/search',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      query,
      numResults,
      type: 'auto',
      contents: { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
      ...(since ? { startPublishedDate: since } : {}),
    },
    ...READ,
  });
  if (response.status >= 400) throw new Error(`exa HTTP ${response.status}`);
  const body = response.json<{
    results?: ExaResult[];
    costDollars?: { total?: number };
  }>();
  return {
    usd: body.costDollars?.total,
    hits: (body.results ?? []).map(r => ({
      source: 'exa',
      title: clip(r.title, 200) || r.url,
      url: r.url,
      snippet: clip(r.highlights?.join(' … ') ?? r.summary ?? r.text, 600),
      publishedAt: r.publishedDate,
    })),
  };
}

// ---- Firecrawl search (plan credits, tier 1) ------------------------------

const TBS: Partial<Record<Freshness, string>> = {
  live: 'qdr:d',
  day: 'qdr:d',
  week: 'qdr:w',
  month: 'qdr:m',
};

export async function firecrawlSearch(
  client: ApiClient,
  query: string,
  freshness: Freshness,
  limit = 5
): Promise<SourceOutput> {
  const tbs = TBS[freshness];
  const response = await client.request({
    url: 'https://api.firecrawl.dev/v1/search',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { query, limit, ...(tbs ? { tbs } : {}) },
    timeoutMs: 30_000,
    ...READ,
  });
  if (response.status >= 400)
    throw new Error(`firecrawl HTTP ${response.status}`);
  const body = response.json<{
    data?: { url: string; title?: string; description?: string }[];
  }>();
  return {
    usd: 0,
    hits: (body.data ?? []).map(r => ({
      source: 'firecrawl',
      title: clip(r.title, 200) || r.url,
      url: r.url,
      snippet: clip(r.description, 600),
    })),
  };
}

// ---- Cloudflare (credits): account, Browser Rendering fetch ----------------

export async function cloudflareFetch(
  client: ApiClient,
  url: string,
  maxChars = 6000
): Promise<SourceOutput> {
  const account = await cloudflareAccount(client);
  const response = await client.request({
    url: `https://api.cloudflare.com/client/v4/accounts/${account}/browser-rendering/markdown`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { url },
    timeoutMs: 45_000,
    ...READ,
  });
  if (response.status >= 400)
    throw new Error(`cloudflare fetch HTTP ${response.status}`);
  const markdown = response.json<{ result?: string }>().result ?? '';
  const title = markdown.match(/^title:\s*"?(.+?)"?$/m)?.[1] ?? url;
  const body = markdown.replace(/^---[\s\S]*?---\n/, '');
  return {
    hits: [
      {
        source: 'cloudflare-fetch',
        title: clip(title, 200),
        url,
        snippet: clip(body, 600),
        content: body.slice(0, maxChars),
      },
    ],
  };
}

// ---- Perplexity (paid, tier 2; disabled until Tim funds it) ---------------

export async function perplexityAnswer(
  client: ApiClient,
  query: string
): Promise<SourceOutput> {
  const response = await client.request({
    url: 'https://api.perplexity.ai/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'sonar', messages: [{ role: 'user', content: query }] },
    timeoutMs: 60_000,
    ...READ,
  });
  if (response.status >= 400)
    throw new Error(`perplexity HTTP ${response.status}`);
  const body = response.json<{
    choices?: { message?: { content?: string } }[];
    search_results?: {
      title?: string;
      url: string;
      snippet?: string;
      date?: string;
    }[];
    usage?: { cost?: { total_cost?: number } };
  }>();
  return {
    usd: body.usage?.cost?.total_cost,
    answer: body.choices?.[0]?.message?.content,
    hits: (body.search_results ?? []).map(r => ({
      source: 'perplexity',
      title: clip(r.title, 200) || r.url,
      url: r.url,
      snippet: clip(r.snippet, 600),
      publishedAt: r.date,
    })),
  };
}

// ---- Hyperagent deep research thread (credits, tier 1, deep mode) ---------

const HYPERAGENT_MCP = 'https://hyperagent.com/api/mcp';

async function mcpSession(client: ApiClient): Promise<Record<string, string>> {
  const base = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
  };
  const init = await client.request({
    url: HYPERAGENT_MCP,
    method: 'POST',
    headers: base,
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'jovie-research', version: '1.0.0' },
      },
    },
    ...READ,
  });
  if (init.status >= 400)
    throw new Error(`hyperagent initialize HTTP ${init.status}`);
  const session = init.headers.get('mcp-session-id');
  const headers = session ? { ...base, 'mcp-session-id': session } : base;
  await client
    .request({
      url: HYPERAGENT_MCP,
      method: 'POST',
      headers,
      body: { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...READ,
    })
    .catch(() => undefined);
  return headers;
}

async function mcpTool<T>(
  client: ApiClient,
  headers: Record<string, string>,
  name: string,
  args: Record<string, unknown>,
  idempotent = true
): Promise<T> {
  const response = await client.request({
    url: HYPERAGENT_MCP,
    method: 'POST',
    headers,
    body: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    },
    timeoutMs: 60_000,
    write: !idempotent,
    idempotent,
  });
  if (response.status >= 400)
    throw new Error(`hyperagent ${name} HTTP ${response.status}`);
  return parseMcpBody(
    response.text,
    response.headers.get('content-type') ?? ''
  ) as T;
}

export const DEEP_PROMPT = (query: string, freshness: Freshness) =>
  [
    'Research question (read-only; do not take actions, write code or contact anyone):',
    query,
    freshness === 'evergreen'
      ? ''
      : `Prefer sources from the last ${DAYS[freshness]} days.`,
    'Use web search. Reply with ONLY a JSON object, no prose around it:',
    '{"answer": "<=200 words, cite sources inline as [n]", "sources": [{"title": "", "url": "", "snippet": "<=40 words"}]}',
  ]
    .filter(Boolean)
    .join('\n');

interface ThreadMessage {
  role?: string;
  content?: unknown;
  text?: string;
}

function lastAssistantText(thread: {
  messages?: ThreadMessage[];
}): string | null {
  const messages = thread.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    if (typeof m.text === 'string' && m.text) return m.text;
    if (typeof m.content === 'string' && m.content) return m.content;
    if (Array.isArray(m.content)) {
      const text = m.content
        .map(p =>
          typeof p === 'object' && p && 'text' in p ? String(p.text) : ''
        )
        .join('');
      if (text) return text;
    }
  }
  return null;
}

export function parseDeepAnswer(text: string): SourceOutput {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  try {
    const parsed = JSON.parse(json ?? '') as {
      answer?: string;
      sources?: { title?: string; url?: string; snippet?: string }[];
    };
    return {
      answer: parsed.answer,
      hits: (parsed.sources ?? [])
        .filter(s => typeof s.url === 'string' && /^https?:/.test(s.url))
        .map(s => ({
          source: 'hyperagent',
          title: clip(s.title, 200) || String(s.url),
          url: String(s.url),
          snippet: clip(s.snippet, 400),
        })),
    };
  } catch {
    const urls = [...text.matchAll(/https?:\/\/[^\s)\]>"]+/g)].map(m => m[0]);
    return {
      answer: clip(text, 2000),
      hits: [...new Set(urls)].map(url => ({
        source: 'hyperagent',
        title: url,
        url,
        snippet: '',
      })),
    };
  }
}

export async function hyperagentDeep(
  client: ApiClient,
  agentId: string,
  query: string,
  freshness: Freshness,
  {
    timeoutMs = 480_000,
    pollMs = 5_000,
    sleep = (ms: number) => new Promise(r => setTimeout(r, ms)),
  } = {}
): Promise<SourceOutput & { threadId: string }> {
  const headers = await mcpSession(client);
  const created = await mcpTool<{ threadId?: string }>(
    client,
    headers,
    'create_thread',
    {
      agentId,
      message: DEEP_PROMPT(query, freshness),
      namingHint: `research: ${query}`.slice(0, 80),
    },
    false
  );
  const threadId = created.threadId;
  if (!threadId)
    throw new Error('hyperagent create_thread returned no threadId');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollMs);
    const thread = await mcpTool<{
      isRunning?: boolean;
      awaitingApproval?: boolean;
      messages?: ThreadMessage[];
    }>(client, headers, 'get_thread', { threadId, messageLimit: 20 });
    if (thread.awaitingApproval)
      throw new Error(`hyperagent thread ${threadId} awaits approval`);
    if (thread.isRunning) continue;
    const text = lastAssistantText(thread);
    if (!text)
      throw new Error(`hyperagent thread ${threadId} finished without text`);
    return { ...parseDeepAnswer(text), threadId };
  }
  throw new Error(`hyperagent thread ${threadId} timed out`);
}

// ---- last30days social research (free sources, tier 1) --------------------

export function last30daysScript(home = homedir()): string | null {
  const path = join(
    home,
    '.claude',
    'skills',
    'last30days',
    'scripts',
    'last30days.py'
  );
  return existsSync(path) ? path : null;
}

function python312(): string {
  for (const bin of [
    '/opt/homebrew/bin/python3.14',
    '/opt/homebrew/bin/python3.13',
    '/opt/homebrew/bin/python3.12',
  ]) {
    if (existsSync(bin)) return bin;
  }
  return 'python3';
}

export async function last30days(
  query: string,
  freshness: Freshness
): Promise<SourceOutput> {
  const script = last30daysScript();
  if (!script) throw new Error('last30days skill not installed');
  const days = Math.min(30, DAYS[freshness] ?? 30);
  const { stdout } = await run(
    python312(),
    [script, query, '--emit=json', '--quick', '--days', String(days)],
    { timeout: 240_000, maxBuffer: 32 * 1024 * 1024 }
  );
  const body = JSON.parse(stdout) as {
    ranked_candidates?: {
      title?: string;
      url?: string;
      snippet?: string;
      source?: string;
    }[];
  };
  return {
    usd: 0,
    hits: (body.ranked_candidates ?? [])
      .filter(c => c.url)
      .slice(0, 10)
      .map(c => ({
        source: `last30days:${c.source ?? 'web'}`,
        title: clip(c.title, 200) || String(c.url),
        url: String(c.url),
        snippet: clip(c.snippet, 500),
      })),
  };
}
