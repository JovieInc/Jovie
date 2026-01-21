/**
 * Linktree Document Fetching
 *
 * Handles fetching Linktree profile pages with proper error handling.
 */

import { ExtractionError, type FetchOptions, fetchDocument } from '../base';
import { LINKTREE_CONFIG } from './config';
import { validateLinktreeUrl } from './validation';

/**
 * Fetches the HTML content of a Linktree profile.
 * Includes timeout, retries, and proper error handling.
 *
 * @throws {ExtractionError} On fetch failure, timeout, or invalid response
 */
export async function fetchLinktreeDocument(
  sourceUrl: string,
  timeoutMs = LINKTREE_CONFIG.defaultTimeoutMs
): Promise<string> {
  // Validate URL first
  const validatedUrl = validateLinktreeUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Linktree URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
    headers: {
      // Linktree may serve different content based on Accept header
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: LINKTREE_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}
