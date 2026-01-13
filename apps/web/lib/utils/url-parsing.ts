export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Sensitive query parameter names that should be removed from URLs before logging.
 * Prevents accidental exposure of authentication tokens and credentials in logs.
 */
const SENSITIVE_PARAMS = ['token', 'key', 'auth', 'password', 'secret'];

export function sanitizeUrlForLogging(url: string): string {
  try {
    const urlObj = new URL(url);

    // Remove all sensitive query parameters
    for (const param of SENSITIVE_PARAMS) {
      urlObj.searchParams.delete(param);
    }

    return urlObj.toString();
  } catch {
    return '[Invalid URL]';
  }
}
