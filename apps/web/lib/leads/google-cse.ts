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

interface GoogleCSEResponse {
  items?: Array<{
    link: string;
    title: string;
    snippet: string;
  }>;
  error?: { code: number; message: string };
}

async function handleCSEApiError(
  error: { code: number; message: string },
  context: { query: string; startIndex: number; attempt: number },
  isLastAttempt: boolean
): Promise<'retry' | 'empty'> {
  if (error.code === 429) {
    pipelineWarn('discovery', 'Google CSE quota exhausted (429)', {
      query: context.query,
      attempt: context.attempt,
    });
    return 'empty';
  }
  if (isRetryableStatus(error.code) && !isLastAttempt) {
    await sleep(calculateRetryDelayMs(context.attempt));
    return 'retry';
  }
  await captureError('Google CSE API error', new Error(error.message), {
    route: 'leads/google-cse',
    contextData: { code: error.code, ...context },
  });
  return 'empty';
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
    const missing = [
      !apiKey && 'GOOGLE_CSE_API_KEY',
      !engineId && 'GOOGLE_CSE_ENGINE_ID',
    ].filter(Boolean);
    pipelineWarn('discovery', 'Google CSE not configured', { missing });
    return [];
  }

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
      const data = await fetchGoogleCSEWithTimeout(url.toString());

      if (data.error) {
        const action = await handleCSEApiError(
          data.error,
          { query, startIndex, attempt },
          isLastAttempt
        );
        if (action === 'retry') continue;
        return [];
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

      return results;
    } catch (error) {
      if (!isLastAttempt) {
        await sleep(calculateRetryDelayMs(attempt));
        continue;
      }

      await captureError('Google CSE request failed', error, {
        route: 'leads/google-cse',
        contextData: {
          query,
          startIndex,
          attempts: attempt,
        },
      });
      return [];
    }
  }

  return [];
}

function isRetryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

function calculateRetryDelayMs(attempt: number): number {
  return GOOGLE_CSE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

async function fetchGoogleCSEWithTimeout(
  url: string
): Promise<GoogleCSEResponse> {
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
