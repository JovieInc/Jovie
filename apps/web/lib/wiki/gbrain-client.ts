import 'server-only';

import { env } from '@/lib/env-server';
import { serverFetch } from '@/lib/http/server-fetch';

interface McpRequest {
  jsonrpc: '2.0';
  id: string;
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface McpResponse {
  jsonrpc: '2.0';
  id: string;
  result?: {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

type McpCallResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface McpCallOptions {
  readonly retry?: boolean;
  readonly signal?: AbortSignal;
}

const GBRAIN_REQUEST_TIMEOUT_MS = 3500;

function resolveMcpUrl(apiUrl: string): URL {
  const url = new URL(apiUrl);
  if (!url.pathname.endsWith('/mcp')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/mcp`;
  }
  return url;
}

function parseMcpResponse(raw: string): McpResponse {
  const dataLines = raw
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => line.slice(6));

  if (dataLines.length === 0) {
    return JSON.parse(raw) as McpResponse;
  }

  for (let index = dataLines.length - 1; index >= 0; index -= 1) {
    const payload = dataLines[index];
    if (!payload) continue;
    const parsed = JSON.parse(payload) as McpResponse;
    if (parsed.result || parsed.error) return parsed;
  }

  throw new Error('gbrain response did not contain a result');
}

export async function mcpCall<T>(
  toolName: string,
  args: Record<string, unknown>,
  options: McpCallOptions = {}
): Promise<{ ok: true; data: T } | { ok: false; reason: string }> {
  const apiUrl = env.GBRAIN_API_URL || 'http://127.0.0.1:7801';
  const apiKey = env.GBRAIN_API_KEY;

  if (!apiKey) {
    return { ok: false, reason: 'GBRAIN_API_KEY not configured' };
  }

  try {
    const request: McpRequest = {
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    const response = await serverFetch(resolveMcpUrl(apiUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(request),
      cache: 'no-store',
      context: `gbrain ${toolName}`,
      retry: options.retry
        ? { maxRetries: 1, baseDelayMs: 100, maxDelayMs: 100 }
        : undefined,
      signal: options.signal,
      timeoutMs: GBRAIN_REQUEST_TIMEOUT_MS,
    });

    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, reason: `gbrain HTTP ${response.status}` };
    }
    const mcpResponse = parseMcpResponse(raw);

    if (mcpResponse.error) {
      return {
        ok: false,
        reason: `gbrain error: ${mcpResponse.error.message}`,
      };
    }

    const contentBlock = mcpResponse.result?.content?.[0];
    if (!contentBlock) {
      return { ok: false, reason: 'empty gbrain response' };
    }

    if (mcpResponse.result?.isError) {
      return { ok: false, reason: `gbrain error: ${contentBlock.text}` };
    }

    const parsed = JSON.parse(contentBlock.text);
    return { ok: true, data: parsed as T };
  } catch (e) {
    return {
      ok: false,
      reason: `gbrain unreachable: ${e instanceof Error ? e.message : 'unknown error'}`,
    };
  }
}

async function mcpCallWithLegacyAlias<T>(
  toolNames: readonly [string, string],
  args: Record<string, unknown>,
  options: McpCallOptions = {}
): Promise<McpCallResult<T>> {
  const primary = await mcpCall<T>(toolNames[0], args, options);
  if (
    primary.ok ||
    !/unknown[_ ]?(?:tool|operation)|(?:tool|method|operation).*not found/i.test(
      primary.reason
    )
  ) {
    return primary;
  }
  return mcpCall<T>(toolNames[1], args, options);
}

export interface GbrainPage {
  slug: string;
  title: string;
  compiled_truth?: string;
  type?: string;
  updated_at?: string;
  tags?: string[];
}

export interface GbrainSearchResult {
  readonly slug: string;
  readonly title: string;
  readonly score?: number;
  readonly chunk_text?: string;
  readonly chunk_source?: 'compiled_truth' | 'raw_data' | 'timeline';
  readonly source_id?: string;
}

export async function listPages(
  limit = 50,
  sort = 'updated_desc'
): Promise<
  {
    slug: string;
    title: string;
    type?: string;
    updated_at?: string;
    tags?: string[];
  }[]
> {
  const result = await mcpCallWithLegacyAlias<GbrainPage[]>(
    ['list_pages', 'page/list'],
    { limit, sort },
    { retry: true }
  );
  if (!result.ok) return [];
  return Array.isArray(result.data) ? result.data : [];
}

export async function getPage(
  slug: string
): Promise<{ slug: string; title: string; compiled_truth?: string } | null> {
  const result = await mcpCallWithLegacyAlias<GbrainPage>(
    ['get_page', 'page/get'],
    { slug },
    { retry: true }
  );
  if (!result.ok) return null;
  return {
    slug: result.data.slug,
    title: result.data.title,
    compiled_truth: result.data.compiled_truth,
  };
}

export async function searchPages(
  query: string,
  limit = 20,
  signal?: AbortSignal
): Promise<GbrainSearchResult[]> {
  const result = await mcpCallWithLegacyAlias<GbrainSearchResult[]>(
    ['query', 'search/query'],
    {
      detail: 'medium',
      expand: false,
      limit,
      query,
    },
    { retry: false, signal }
  );
  if (!result.ok) return [];
  return Array.isArray(result.data) ? result.data : [];
}

/**
 * Narrow upsert for Summer operational-memory pages.
 * Soft-fails when GBrain is down or rejects the method — callers must buffer.
 */
export async function putPage(input: {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const slug = input.slug.trim();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!slug || !title || !body) {
    return { ok: false, reason: 'slug, title, and body are required' };
  }
  return mcpCallWithLegacyAlias<unknown>(
    ['put_page', 'page/put'],
    {
      slug,
      title,
      content: body,
      body,
    },
    { retry: false }
  ).then(result =>
    result.ok
      ? { ok: true as const }
      : { ok: false as const, reason: result.reason }
  );
}
