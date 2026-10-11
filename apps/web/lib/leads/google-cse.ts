import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import {
  SEARCH_API_MAX_RETRIES,
  SEARCH_API_RETRY_BASE_DELAY_MS,
  SEARCH_API_TIMEOUT_MS,
} from './constants';
import { pipelineLog, pipelineWarn } from './pipeline-logger';

export interface WebSearchResult {
  link: string;
  title: string;
  snippet: string;
}

// Discovery must distinguish "provider failed" from "genuinely zero demand".
// A failure is never reported as an empty result set and must not earn a
// successful-run receipt or reset pagination as though the index was exhausted.
export type SearchProviderName = 'serpapi' | 'exa' | 'none';

export type SearchStatus =
  | 'ok'
  | 'empty'
  | 'not_configured'
  | 'quota_exceeded'
  | 'unauthorized'
  | 'timeout'
  | 'provider_error';

export interface SearchOutcome {
  status: SearchStatus;
  provider: SearchProviderName;
  results: WebSearchResult[];
  error: string | null;
}

function outcome(
  status: SearchStatus,
  provider: SearchProviderName,
  results: WebSearchResult[] = [],
  error: string | null = null
): SearchOutcome {
  return { status, provider, results, error };
}

function classifyHttpStatus(status: number): SearchStatus {
  if (status === 402 || status === 429) return 'quota_exceeded';
  if (status === 401 || status === 403) return 'unauthorized';
  return 'provider_error';
}

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode >= 500;
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
    (error instanceof Error && /timed out/i.test(error.message))
  );
}

interface SerpAPIResponse {
  organic_results?: Array<{
    link: string;
    title: string;
    snippet?: string;
  }>;
  error?: string;
}

function classifySerpAPIError(
  message: string,
  httpStatus: number
): SearchStatus {
  if (
    httpStatus === 429 ||
    /quota|rate limit|run out of searches/i.test(message)
  ) {
    return 'quota_exceeded';
  }
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /invalid api key/i.test(message)
  ) {
    return 'unauthorized';
  }
  return 'provider_error';
}

async function searchSerpAPI(
  query: string,
  startIndex: number,
  apiKey: string
): Promise<SearchOutcome> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('start', String(startIndex - 1));
  url.searchParams.set('num', '10');

  pipelineLog('discovery', 'SerpAPI search started', { query, startIndex });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_API_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });
    const data = (await response.json()) as SerpAPIResponse;

    if (!response.ok || data.error) {
      const errorMessage = data.error || `SerpAPI returned ${response.status}`;
      const status = classifySerpAPIError(errorMessage, response.status);
      pipelineWarn('discovery', 'SerpAPI error', {
        error: errorMessage,
        query,
        status,
      });
      await captureError('SerpAPI error', new Error(errorMessage), {
        route: 'leads/web-search',
        contextData: { query, startIndex, status: response.status },
      });
      return outcome(status, 'serpapi', [], errorMessage);
    }

    const results = (data.organic_results ?? []).map(item => ({
      link: item.link,
      title: item.title,
      snippet: item.snippet ?? '',
    }));

    pipelineLog('discovery', 'SerpAPI search complete', {
      query,
      resultCount: results.length,
    });

    return outcome(results.length > 0 ? 'ok' : 'empty', 'serpapi', results);
  } catch (error) {
    if (isTimeoutError(error)) {
      pipelineWarn('discovery', 'SerpAPI request timed out', { query });
      return outcome(
        'timeout',
        'serpapi',
        [],
        `SerpAPI request timed out after ${SEARCH_API_TIMEOUT_MS}ms`
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    await captureError('SerpAPI request failed', error, {
      route: 'leads/web-search',
      contextData: { query, startIndex },
    });
    return outcome('provider_error', 'serpapi', [], message);
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ExaResponse {
  results?: Array<{
    title?: string | null;
    url?: string;
    highlights?: string[];
  }>;
  error?: string;
}

interface ExaQuery {
  query: string;
  includeDomains?: string[];
}

function toExaQuery(query: string): ExaQuery {
  const includeDomains: string[] = [];
  const queryWithoutSiteFilters = query
    .replace(/(?:^|\s)site:([^\s]+)/gi, (_match, rawDomain: string) => {
      const domain = rawDomain.replace(/^["']|["']$/g, '').trim();
      if (domain && !includeDomains.includes(domain)) {
        includeDomains.push(domain);
      }
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  return {
    query: queryWithoutSiteFilters || includeDomains.join(' ') || query.trim(),
    ...(includeDomains.length > 0 ? { includeDomains } : {}),
  };
}

function calculateRetryDelayMs(attempt: number): number {
  return SEARCH_API_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

async function fetchExa(
  body: Record<string, unknown>,
  apiKey: string
): Promise<{ response: Response; data: ExaResponse }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_API_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as ExaResponse;
    return { response, data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Exa request timed out after ${SEARCH_API_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchExa(
  query: string,
  startIndex: number,
  apiKey: string
): Promise<SearchOutcome> {
  const finiteStartIndex = Number.isFinite(startIndex) ? startIndex : 1;
  const normalizedStartIndex = Math.min(
    Math.max(Math.trunc(finiteStartIndex), 1),
    91
  );
  const requestedResultCount = Math.min(normalizedStartIndex + 9, 100);
  const exaQuery = toExaQuery(query);
  const requestBody = {
    ...exaQuery,
    type: 'auto',
    numResults: requestedResultCount,
  };

  pipelineLog('discovery', 'Exa search started', {
    query,
    startIndex: normalizedStartIndex,
  });

  const lastAttempt = SEARCH_API_MAX_RETRIES + 1;
  for (let attempt = 1; attempt <= lastAttempt; attempt++) {
    const isLastAttempt = attempt === lastAttempt;

    try {
      const { response, data } = await fetchExa(requestBody, apiKey);
      if (!response.ok || data.error) {
        const errorMessage = data.error || `Exa returned ${response.status}`;
        const status = classifyHttpStatus(response.status);

        if (isRetryableStatus(response.status) && !isLastAttempt) {
          await sleep(calculateRetryDelayMs(attempt));
          continue;
        }

        pipelineWarn('discovery', 'Exa search error', {
          error: errorMessage,
          query,
          status,
        });
        if (status !== 'quota_exceeded') {
          await captureError('Exa search error', new Error(errorMessage), {
            route: 'leads/web-search',
            contextData: {
              query,
              startIndex: normalizedStartIndex,
              status: response.status,
            },
          });
        }
        return outcome(status, 'exa', [], errorMessage);
      }

      const results = (data.results ?? [])
        .slice(normalizedStartIndex - 1, normalizedStartIndex + 9)
        .flatMap(item =>
          item.url
            ? [
                {
                  link: item.url,
                  title: item.title ?? '',
                  snippet: item.highlights?.[0] ?? '',
                },
              ]
            : []
        );

      pipelineLog('discovery', 'Exa search complete', {
        query,
        resultCount: results.length,
      });
      return outcome(results.length > 0 ? 'ok' : 'empty', 'exa', results);
    } catch (error) {
      if (isTimeoutError(error)) {
        pipelineWarn('discovery', 'Exa request timed out', { query });
        return outcome(
          'timeout',
          'exa',
          [],
          error instanceof Error ? error.message : String(error)
        );
      }

      if (!isLastAttempt) {
        await sleep(calculateRetryDelayMs(attempt));
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      await captureError('Exa request failed', error, {
        route: 'leads/web-search',
        contextData: {
          query,
          startIndex: normalizedStartIndex,
          attempts: attempt,
        },
      });
      return outcome('provider_error', 'exa', [], message);
    }
  }

  return outcome('provider_error', 'exa', [], 'exhausted retries');
}

/**
 * Searches with a typed outcome so callers can distinguish genuine empty
 * results from missing configuration, quota, auth, timeout, or provider
 * failure. SerpAPI remains preferred when configured; Exa is the fallback.
 */
export async function searchWebWithStatus(
  query: string,
  startIndex = 1
): Promise<SearchOutcome> {
  const serpApiKey = env.SERPAPI_API_KEY;
  if (serpApiKey) {
    return searchSerpAPI(query, startIndex, serpApiKey);
  }

  const exaApiKey = env.EXA_API_KEY;
  if (!exaApiKey) {
    const missing = ['SERPAPI_API_KEY', 'EXA_API_KEY'];
    pipelineWarn('discovery', 'Search API not configured', { missing });
    return outcome(
      'not_configured',
      'none',
      [],
      `missing env: ${missing.join(', ')}`
    );
  }

  return searchExa(query, startIndex, exaApiKey);
}

export async function searchWeb(
  query: string,
  startIndex = 1
): Promise<WebSearchResult[]> {
  const result = await searchWebWithStatus(query, startIndex);
  return result.results;
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}
