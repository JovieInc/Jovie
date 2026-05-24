export const CSRF_COOKIE_NAME = 'jovie_csrf';
export const CSRF_HEADER_NAME = 'x-jovie-csrf';

export function isUnsafeMethod(method: string | undefined): boolean {
  switch ((method ?? '').toUpperCase()) {
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
      return true;
    default:
      return false;
  }
}

export function getBrowserCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const prefix = `${CSRF_COOKIE_NAME}=`;
  for (const entry of document.cookie.split(';')) {
    const trimmed = entry.trim();
    if (trimmed.startsWith(prefix)) {
      const token = trimmed.slice(prefix.length);
      return token.length > 0 ? token : null;
    }
  }

  return null;
}

export function isSameOriginApiRequest(url: string): boolean {
  const origin = globalThis.location?.origin;
  if (typeof origin !== 'string' || origin.length === 0) {
    return false;
  }

  try {
    const requestUrl = new URL(url, origin);
    return (
      requestUrl.origin === origin && requestUrl.pathname.startsWith('/api/')
    );
  } catch {
    return false;
  }
}

export function shouldAttachCsrfHeader(
  url: string,
  method: string | undefined
): boolean {
  return isUnsafeMethod(method) && isSameOriginApiRequest(url);
}
