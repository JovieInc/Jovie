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

export function sanitizeUrlForLogging(url: string): string {
  try {
    const urlObj = new URL(url);

    urlObj.searchParams.delete('token');
    urlObj.searchParams.delete('key');
    urlObj.searchParams.delete('auth');
    urlObj.searchParams.delete('password');
    urlObj.searchParams.delete('secret');

    return urlObj.toString();
  } catch {
    return '[Invalid URL]';
  }
}
