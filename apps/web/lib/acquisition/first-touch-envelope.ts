/**
 * Passive first-touch acquisition envelope (JOV-5036).
 *
 * Captures the privacy-bounded marketing first touch before auth: an
 * allowlisted set of UTM fields, the external referrer HOST only, and the
 * originating Jovie route kind/slug. Arbitrary query strings, fragments,
 * PII, tokens, and unsupported parameters are dropped at the boundary.
 *
 * The envelope is sealed with HMAC-SHA256 (Web Crypto so the proxy/edge
 * runtime can seal and Node can open) and carried in the `jovie_first_touch`
 * cookie with first-touch-wins semantics: a valid, unexpired envelope is
 * never overwritten by later touches.
 *
 * This module must stay runtime-agnostic: no `server-only`, no `env-server`,
 * no `node:crypto`, no DB access.
 */

export const FIRST_TOUCH_COOKIE = 'jovie_first_touch';
export const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FIRST_TOUCH_SECRET_DOMAIN = 'acquisition-first-touch-envelope-v1';
const MAX_FIELD_LENGTH = 128;

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type FirstTouchChannel = 'campaign' | 'referral' | 'direct';

export interface FirstTouchRoute {
  readonly kind: string;
  readonly slug?: string;
}

export interface FirstTouchEnvelope {
  readonly v: 1;
  /** Envelope id; doubles as the acquisition receipt id. */
  readonly id: string;
  readonly iat: number;
  readonly exp: number;
  readonly channel: FirstTouchChannel;
  readonly utm?: Partial<Record<(typeof UTM_KEYS)[number], string>>;
  /** External referrer hostname only — never path, query, or fragment. */
  readonly ref?: string;
  readonly route?: FirstTouchRoute;
}

/** Segments that name a Jovie route rather than a public profile slug. */
const KNOWN_ROUTE_SEGMENTS = new Set([
  'a',
  'account',
  'api',
  'app',
  'artist-selection',
  'artists',
  'auth',
  'auth-return',
  'billing',
  'brand',
  'claim',
  'demo',
  'desktop-auth',
  'drop',
  'error',
  'exp',
  'go',
  'hud',
  'investor-portal',
  'mobile-auth-return',
  'onboarding',
  'out',
  'p',
  'pricing',
  'r',
  'report',
  's',
  'sandbox',
  'signin',
  'signup',
  'start',
  'support',
  'waitlist',
]);

const OWN_HOST_SUFFIXES = ['jov.ie', 'meetjovie.com'];

function isOwnHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return OWN_HOST_SUFFIXES.some(
    suffix => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/** A value that looks like an email address is PII, not attribution. */
function looksLikePii(value: string): boolean {
  return /@/.test(value) || /%(40|2f|3a)/i.test(value);
}

function sanitizeField(value: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
  if (!cleaned || looksLikePii(cleaned)) return undefined;
  return cleaned;
}

function sanitizeUtm(searchParams: URLSearchParams) {
  const utm: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  for (const key of UTM_KEYS) {
    const value = sanitizeField(searchParams.get(key));
    if (value) utm[key] = value.toLowerCase();
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
}

function sanitizeReferrerHost(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    const host = url.hostname.toLowerCase();
    if (!host || isOwnHost(host) || looksLikePii(host)) return undefined;
    return host.slice(0, 255);
  } catch {
    return undefined;
  }
}

function classifyRoute(pathname: string): FirstTouchRoute {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0]?.toLowerCase();
  if (!first) return { kind: 'home' };
  if (KNOWN_ROUTE_SEGMENTS.has(first)) return { kind: first };
  const slug = sanitizeField(first);
  return slug ? { kind: 'profile', slug } : { kind: 'profile' };
}

export interface FirstTouchSource {
  /** Full request URL (query is read for the allowlist, never stored). */
  readonly url: URL;
  /** Raw `Referer` header value, if any. */
  readonly referer?: string | null;
}

/** Build the sanitized first-touch fields for a navigation request. */
export function buildFirstTouch(
  source: FirstTouchSource,
  now = Date.now()
): FirstTouchEnvelope {
  const utm = sanitizeUtm(source.url.searchParams);
  const ref = sanitizeReferrerHost(source.referer ?? null);
  const channel: FirstTouchChannel = utm?.utm_source
    ? 'campaign'
    : ref
      ? 'referral'
      : 'direct';

  return {
    v: 1,
    id: crypto.randomUUID(),
    iat: now,
    exp: now + FIRST_TOUCH_TTL_MS,
    channel,
    ...(utm ? { utm } : {}),
    ...(ref ? { ref } : {}),
    route: classifyRoute(source.url.pathname),
  };
}

function getEnvelopeSecret(): string | null {
  return (
    process.env.ACQUISITION_FIRST_TOUCH_SECRET ??
    process.env.LEAD_ATTRIBUTION_SECRET ??
    process.env.URL_ENCRYPTION_KEY ??
    null
  );
}

const encoder = new TextEncoder();
let cachedKey: { secret: string; key: CryptoKey } | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret === secret) return cachedKey.key;
  const domainKey = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${FIRST_TOUCH_SECRET_DOMAIN}:${secret}`)
  );
  const key = await crypto.subtle.importKey(
    'raw',
    domainKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  cachedKey = { secret, key };
  return key;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Serialize and sign an envelope. Returns `null` when no signing secret is
 * configured — capture degrades to a no-op rather than emitting an
 * unverifiable cookie.
 */
export async function sealFirstTouchEnvelope(
  envelope: FirstTouchEnvelope
): Promise<string | null> {
  const secret = getEnvelopeSecret();
  if (!secret) return null;
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(envelope)));
  const signature = toHex(
    await crypto.subtle.sign(
      'HMAC',
      await hmacKey(secret),
      encoder.encode(body)
    )
  );
  return `${body}.${signature}`;
}

/**
 * Verify and decode an envelope cookie value. Returns `null` for missing
 * secrets, tampered signatures, malformed payloads, and expired envelopes.
 */
export async function openFirstTouchEnvelope(
  value: string | undefined,
  now = Date.now()
): Promise<FirstTouchEnvelope | null> {
  if (!value) return null;
  const secret = getEnvelopeSecret();
  if (!secret) return null;

  const separator = value.indexOf('.');
  if (separator <= 0) return null;
  const body = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^[0-9a-f]{64}$/.test(signature)) return null;

  const signatureBytes = Uint8Array.from(signature.match(/../g) ?? [], h =>
    Number.parseInt(h, 16)
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signatureBytes,
    encoder.encode(body)
  );
  if (!valid) return null;

  try {
    const bytes = base64UrlToBytes(body);
    if (!bytes) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(bytes)
    ) as FirstTouchEnvelope;

    if (payload?.v !== 1 || typeof payload.id !== 'string') return null;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
      return null;
    }
    if (payload.exp <= now || payload.iat > now + 60_000) return null;
    if (
      payload.channel !== 'campaign' &&
      payload.channel !== 'referral' &&
      payload.channel !== 'direct'
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
