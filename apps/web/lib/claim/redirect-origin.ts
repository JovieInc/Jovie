/**
 * Absolute claim redirects must follow the browser's Host, not `request.url`.
 *
 * Next 16 rewrites every loopback hostname on `NextRequest.url` to the string
 * `localhost` (`NextURL.parseURL`). Claim routes then do
 * `new URL(pathname, request.url)`, so a visit to `http://127.0.0.1:3100`
 * answers with `Location: http://localhost:3100/...`. The pending-claim cookie
 * is host-only, so the browser drops it on that hop and the protected fixture
 * bounces to `/` instead of signup.
 *
 * Only a loopback Host is honored. Any other Host keeps `request.url`, so a
 * spoofed public Host cannot move the redirect.
 */

const LOOPBACK_HOSTNAME =
  /^(?:localhost|127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}|::1)$/i;

export function buildClaimRedirectUrl(
  request: { readonly url: string; readonly headers: Headers },
  pathname: string
): URL {
  const requestUrl = new URL(request.url);
  const protocol = requestUrl.protocol === 'https:' ? 'https:' : 'http:';
  const origin = loopbackOriginFromHost(request.headers.get('host'), protocol);
  return new URL(pathname, origin ?? request.url);
}

function loopbackOriginFromHost(
  hostHeader: string | null,
  protocol: 'http:' | 'https:'
): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.trim();
  if (host.length === 0 || host.length > 255 || /[\s/?#\\@]/.test(host)) {
    return null;
  }

  let hostname = host;
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end <= 1) return null;
    hostname = host.slice(1, end);
    const rest = host.slice(end + 1);
    if (rest !== '' && !/^:\d{1,5}$/.test(rest)) return null;
  } else {
    const colon = host.lastIndexOf(':');
    if (colon !== -1) {
      if (host.indexOf(':') !== colon) return null;
      hostname = host.slice(0, colon);
      if (!/^\d{1,5}$/.test(host.slice(colon + 1))) return null;
    }
  }

  if (!LOOPBACK_HOSTNAME.test(hostname)) return null;
  return `${protocol}//${host}`;
}
