/**
 * Linktree document access.
 *
 * Profile HTML is not fetched from Jovie servers.
 */

import { disabledSocialHtmlDocument } from '@/lib/ingestion/social-html-policy';
import { ExtractionError } from '../base';
import { validateLinktreeUrl } from './validation';

/**
 * Linktree HTML is not fetched from Jovie servers. Invalid URLs still fail
 * as invalid; every valid profile URL fails closed.
 *
 * @throws {ExtractionError} INVALID_URL or SOCIAL_HTML_DISABLED
 */
export async function fetchLinktreeDocument(
  sourceUrl: string,
  _timeoutMs?: number
): Promise<string> {
  const validatedUrl = validateLinktreeUrl(sourceUrl);
  if (!validatedUrl) {
    throw new ExtractionError('Invalid Linktree URL', 'INVALID_URL');
  }

  return disabledSocialHtmlDocument();
}
