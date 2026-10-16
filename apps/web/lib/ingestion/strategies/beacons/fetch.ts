/**
 * Beacons Document Fetching
 *
 * Rejects core HTML reads until an isolated provider is configured.
 */

import { disabledSocialHtmlDocument } from '@/lib/ingestion/social-html-policy';
import { ExtractionError } from '../base';
import { BEACONS_CONFIG } from './config';
import { validateBeaconsUrl } from './validation';

/**
 * Validates a Beacons profile URL, then fails closed before any network read.
 *
 * @throws {ExtractionError} INVALID_URL or SOCIAL_HTML_DISABLED
 */
export async function fetchBeaconsDocument(
  sourceUrl: string,
  _timeoutMs = BEACONS_CONFIG.defaultTimeoutMs
): Promise<string> {
  // Validate URL first
  const validatedUrl = validateBeaconsUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Beacons.ai URL', 'INVALID_URL');
  }

  return disabledSocialHtmlDocument();
}
