import { captureError } from '@/lib/error-tracking';
import {
  GOOGLE_CSE_MAX_RETRIES,
  GOOGLE_CSE_RETRY_BASE_DELAY_MS,
  GOOGLE_CSE_TIMEOUT_MS,
} from './constants';
import { pipelineLog, pipelineWarn } from './pipeline-logger';

export interface GoogleCSEResult {
  link: string;
  title: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Typed provider outcomes
//
// Discovery must distinguish "provider failed" from "genuinely zero demand".
// A failure is never reported as an empty result set and must not earn a
// successful-run receipt or reset pagination as though the index was exhausted.
// ---------------------------------------------------------------------------

export type SearchProviderName = 'serpapi' | 'google_cse' | 'none';

export type SearchStatus =
  /** Provider executed successfully and returned results. */
  | 'ok'
  /** Provider executed successfully and returned zero results (true empty). */
  | 'empty'
  /** No provider credentials configured — no request was made. */
  | 'not_configured'
  /** Rate/quota limited (HTTP 429, daily limit exceeded, SerpAPI quota error). */
  | 'quota_exceeded'
  /** Blocked or unauthorized (HTTP 401/403). */
  | 'unauthorized'
  /** Request timed out. */
  | 'timeout'
  /** Any other provider or network failure. */
  | 'provider_error';

export interface SearchOutcome {
  status: SearchStatus;
  provider: SearchProviderName;
  results: GoogleCSEResult[];
  error: string | null;
}

function outcome(
  status: SearchStatus,
  provider: SearchProviderName,
  results: GoogleCSEResult[] = [],
  error: string | null = null
): SearchOutcome {
  return { status, provider, results, error };
}

function classifyHttpStatus(status: number): SearchStatus {
  if (status === 429) return 'quota_exceeded';
  if (status === 401 || status === 403) return 'unauthorized';
  return 'provider_error';
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
    (error instanceof Error && /timed out/i.test(error.message))
  );
}

// ---------------------------------------------------------------------------
// SerpAPI integration
// ---------------------------------------------------------------------------

interface SerpAPIResponse {
  organic_results?: Array<{
    link: string;
    title: string;
    snippet: string;
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
  url.searchParams.set('start', String(startIndex - 1)); // SerpAPI uses 0-based
  url.searchParams.set('num', '10');

  pipelineLog('discovery', 'SerpAPI search started', { query, startIndex });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GOOGLE_CSE_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });
    const data = (await response.json()) as SerpAPIResponse;

    if (!response.ok || data.error) {
      const errorMsg = data.error || `SerpAPI returned ${response.status}`;
      const status = classifySerpAPIError(errorMsg, response.status);
      pipelineWarn('discovery', 'SerpAPI error', {
        error: errorMsg,
        query,
        status,
      });
      await captureError('SerpAPI error', new Error(errorMsg), {
        route: 'leads/google-cse',
        contextData: { query, startIndex, status: response.status },
      });
      return outcome(status, 'serpapi', [], errorMsg);
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
        `SerpAPI request timed out after ${GOOGLE_CSE_TIMEOUT_MS}ms`
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    await captureError('SerpAPI request failed', error, {
      route: 'leads/google-cse',
      contextData: { query, startIndex },
    });
    return outcome('provider_error', 'serpapi', [], message);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Google CSE integration (legacy — deprecated by Google for new customers)
// ---------------------------------------------------------------------------

interface GoogleCSEResponse {
  items?: Array<{
    link: string;
    title: string;
    snippet: string;
  }>;
  error?: { code: number; message: string };
}

function classifyCSEError(error: {
  code: number;
  message: string;
}): SearchStatus {
  if (
    error.code === 429 ||
    /dailyLimitExceeded|quotaExceeded|rateLimitExceeded/i.test(error.message)
  ) {
    return 'quota_exceeded';
  }
  return classifyHttpStatus(error.code);
}

async function handleCSEApiError(
  error: { code: number; message: string },
  context: { query: string; startIndex: number; attempt: number },
  isLastAttempt: boolean
): Promise<'retry' | SearchOutcome> {
  const status = classifyCSEError(error);

  if (status === 'quota_exceeded') {
    pipelineWarn('discovery', 'Google CSE quota exhausted (429)', {
      query: context.query,
      attempt: context.attempt,
    });
    return outcome(status, 'google_cse', [], error.message);
  }

  if (isRetryableStatus(error.code) && !isLastAttempt) {
    await sleep(calculateRetryDelayMs(context.attempt));
    return 'retry';
  }

  await captureError('Google CSE API error', new Error(error.message), {
    route: 'leads/google-cse',
    contextData: { code: error.code, ...context },
  });
  return outcome(status, 'google_cse', [], error.message);
}

async function searchGoogleCSEInternal(
  query: string,
  startIndex: number,
  apiKey: string,
  engineId: string
): Promise<SearchOutcome> {
  pipelineLog('discovery', 'CSE search started', { query, startIndex });

  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', engineId);
  url.searchParams.set('q', query);
  url.searchParams.set('start', String(startIndex));
  url.searchParams.set('num', '10');

  const lastAttempt = GOOGLE_CSE_MAX_RETRIES + 1;

  for (let attempt = 1; attempt <= lastAttempt; attempt++) {
    const isLastAttempt = attempt === lastAttempt;

    try {
      const data = await fetchWithTimeout(url.toString());

      if (data.error) {
        const action = await handleCSEApiError(
          data.error,
          { query, startIndex, attempt },
          isLastAttempt
        );
        if (action === 'retry') continue;
        return action;
      }

      const results = (data.items ?? []).map(item => ({
        link: item.link,
        title: item.title,
        snippet: item.snippet,
      }));

      pipelineLog('discovery', 'CSE search complete', {
        query,
        resultCount: results.length,
      });

      return outcome(
        results.length > 0 ? 'ok' : 'empty',
        'google_cse',
        results
      );
    } catch (error) {
      if (isTimeoutError(error)) {
        pipelineWarn('discovery', 'Google CSE request timed out', {
          query,
          attempt,
        });
        return outcome(
          'timeout',
          'google_cse',
          [],
          error instanceof Error ? error.message : String(error)
        );
      }

      if (!isLastAttempt) {
        await sleep(calculateRetryDelayMs(attempt));
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      await captureError('Google CSE request failed', error, {
        route: 'leads/google-cse',
        contextData: { query, startIndex, attempts: attempt },
      });
      return outcome('provider_error', 'google_cse', [], message);
    }
  }

  return outcome('provider_error', 'google_cse', [], 'exhausted retries');
}

// ---------------------------------------------------------------------------
// Public API — delegates to SerpAPI (preferred) or Google CSE (legacy)
// ---------------------------------------------------------------------------

/**
 * Searches with a typed outcome so callers can distinguish a genuine empty
 * result from a missing configuration, quota, auth, timeout or provider
 * failure. SerpAPI is preferred; Google CSE is the legacy fallback.
 * @param query - Search query string (e.g. "site:linktr.ee musician spotify")
 * @param startIndex - 1-based offset for pagination (1, 11, 21, ...)
 */
export async function searchGoogleCSEWithStatus(
  query: string,
  startIndex = 1
): Promise<SearchOutcome> {
  const serpApiKey = process.env.SERPAPI_API_KEY;
  if (serpApiKey) {
    return searchSerpAPI(query, startIndex, serpApiKey);
  }

  // Fall back to Google CSE (deprecated for new customers)
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const engineId = process.env.GOOGLE_CSE_ENGINE_ID;

  if (!apiKey || !engineId) {
    const missing = [
      !serpApiKey && 'SERPAPI_API_KEY',
      !apiKey && 'GOOGLE_CSE_API_KEY',
      !engineId && 'GOOGLE_CSE_ENGINE_ID',
    ].filter(Boolean);
    pipelineWarn('discovery', 'Search API not configured', { missing });
    return outcome(
      'not_configured',
      'none',
      [],
      `missing env: ${missing.join(', ')}`
    );
  }

  return searchGoogleCSEInternal(query, startIndex, apiKey, engineId);
}

/**
 * Back-compat wrapper: returns only the results array. Prefer
 * {@link searchGoogleCSEWithStatus} for truthful failure handling.
 */
export async function searchGoogleCSE(
  query: string,
  startIndex = 1
): Promise<GoogleCSEResult[]> {
  const result = await searchGoogleCSEWithStatus(query, startIndex);
  return result.results;
}

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode >= 500;
}

function calculateRetryDelayMs(attempt: number): number {
  return GOOGLE_CSE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

async function fetchWithTimeout(url: string): Promise<GoogleCSEResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GOOGLE_CSE_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = (await response.json()) as GoogleCSEResponse;

    if (!response.ok && !data.error) {
      data.error = {
        code: response.status,
        message: response.statusText || 'Google CSE request failed',
      };
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Google CSE request timed out after ${GOOGLE_CSE_TIMEOUT_MS}ms`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}
