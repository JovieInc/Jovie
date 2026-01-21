/**
 * Beacons Document Fetching
 *
 * Handles fetching Beacons.ai profile pages with proper error handling.
 */

import { ExtractionError, type FetchOptions, fetchDocument } from '../base';
import { BEACONS_CONFIG } from './config';
import { validateBeaconsUrl } from './validation';

/**
 * Fetches a Beacons.ai profile document with proper error handling.
 *
 * @throws {ExtractionError} On fetch failure, timeout, or invalid response
 */
export async function fetchBeaconsDocument(
  sourceUrl: string,
  timeoutMs = BEACONS_CONFIG.defaultTimeoutMs
): Promise<string> {
  // Validate URL first
  const validatedUrl = validateBeaconsUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Beacons.ai URL', 'INVALID_URL');
  }

  const options: FetchOptions = {
    timeoutMs,
    maxRetries: 2,
    userAgent: 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
    headers: {
      // Beacons may serve different content based on Accept header
      Accept: 'text/html,application/xhtml+xml',
    },
    allowedHosts: BEACONS_CONFIG.validHosts,
  };

  const result = await fetchDocument(validatedUrl, options);
  return result.html;
}
