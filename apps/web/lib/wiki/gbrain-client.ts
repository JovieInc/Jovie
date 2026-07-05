import { env } from '@/lib/env-server';

interface McpRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
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

async function mcpCall<T>(
  method: string,
  params: Record<string, unknown>
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
      method,
      params,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(request),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    const raw = await response.text();
    const lines = raw.split('\n').filter(l => l.startsWith('data: '));
    const jsonStr = lines.map(l => l.slice(6)).join('');
    const mcpResponse: McpResponse = JSON.parse(jsonStr);

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

export interface GbrainPage {
  slug: string;
  title: string;
  compiled_truth?: string;
  type?: string;
  updated_at?: string;
  tags?: string[];
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
  const result = await mcpCall<GbrainPage[]>('page/list', { limit, sort });
  if (!result.ok) return [];
  return result.data;
}

export async function getPage(
  slug: string
): Promise<{ slug: string; title: string; compiled_truth?: string } | null> {
  const result = await mcpCall<GbrainPage>('page/get', {
    slug,
    include_compiled_truth: true,
  });
  if (!result.ok) return null;
  return {
    slug: result.data.slug,
    title: result.data.title,
    compiled_truth: result.data.compiled_truth,
  };
}

export async function searchPages(
  query: string,
  limit = 20
): Promise<
  { slug: string; title: string; score?: number; chunk_text?: string }[]
> {
  const result = await mcpCall<
    Array<{ slug: string; title: string; score?: number; chunk_text?: string }>
  >('search/query', { query, limit });
  if (!result.ok) return [];
  return result.data;
}
