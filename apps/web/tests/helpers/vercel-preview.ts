import type { Page } from '@playwright/test';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function parseBaseUrl(baseURL?: string): URL | null {
  if (!baseURL) return null;

  try {
    return new URL(baseURL);
  } catch {
    return null;
  }
}

export function isExternalBaseUrl(baseURL?: string): baseURL is string {
  const parsed = parseBaseUrl(baseURL);
  if (!parsed) return false;

  return !LOCAL_HOSTS.has(parsed.hostname);
}

export function isSafePreviewBaseUrl(baseURL?: string): baseURL is string {
  const parsed = parseBaseUrl(baseURL);
  if (!parsed) return false;

  return parsed.hostname.includes('vercel.app');
}

export function buildVercelBypassUrl(
  baseURL: string,
  pathname: string = '/'
): string | null {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!bypassSecret || !isSafePreviewBaseUrl(baseURL)) {
    return null;
  }

  const url = new URL(pathname, baseURL);
  url.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  url.searchParams.set('x-vercel-protection-bypass', bypassSecret);
  return url.toString();
}

export async function primeVercelBypassCookie(
  page: Page,
  baseURL: string | undefined,
  pathname: string = '/'
): Promise<boolean> {
  const bypassUrl = baseURL ? buildVercelBypassUrl(baseURL, pathname) : null;
  if (!bypassUrl) return false;

  await page.goto(bypassUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  return true;
}
