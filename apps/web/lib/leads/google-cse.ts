import { captureError } from '@/lib/error-tracking';

export interface GoogleCSEResult {
  link: string;
  title: string;
  snippet: string;
}

interface GoogleCSEResponse {
  items?: Array<{
    link: string;
    title: string;
    snippet: string;
  }>;
  error?: { code: number; message: string };
}

/**
 * Searches Google Custom Search Engine for results.
 * @param query - Search query string (e.g. "site:linktr.ee musician spotify")
 * @param startIndex - 1-based offset for pagination (1, 11, 21, ...)
 */
export async function searchGoogleCSE(
  query: string,
  startIndex = 1
): Promise<GoogleCSEResult[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const engineId = process.env.GOOGLE_CSE_ENGINE_ID;

  if (!apiKey || !engineId) {
    throw new Error('GOOGLE_CSE_API_KEY and GOOGLE_CSE_ENGINE_ID must be set');
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', engineId);
  url.searchParams.set('q', query);
  url.searchParams.set('start', String(startIndex));
  url.searchParams.set('num', '10');

  const response = await fetch(url.toString());
  const data = (await response.json()) as GoogleCSEResponse;

  if (!response.ok || data.error) {
    const code = data.error?.code ?? response.status;
    const message = data.error?.message ?? response.statusText;

    // 429 = quota exceeded — not an error, just budget exhausted
    if (code === 429) {
      return [];
    }

    await captureError('Google CSE API error', new Error(message), {
      route: 'leads/google-cse',
      contextData: { code, query, startIndex },
    });
    return [];
  }

  return (data.items ?? []).map(item => ({
    link: item.link,
    title: item.title,
    snippet: item.snippet,
  }));
}
