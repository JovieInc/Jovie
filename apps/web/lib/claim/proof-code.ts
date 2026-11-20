/**
 * Automatic ownership proof, pure parts.
 *
 * The artist adds a short code to a public page that already belongs to the
 * identity we resolved (their official website or link page), and we read that
 * page. A match means whoever holds the page put the code there, which is the
 * ownership signal. Operator review remains the fallback.
 *
 * Safety rules enforced here, not left to callers:
 * - only pages already stored on the resolved identity are ever fetched; the
 *   artist never supplies a URL;
 * - https only, no ports, no credentials, no IP literals, no private names;
 * - social networks are excluded: the platform policy forbids scraping their
 *   HTML from Jovie IPs (lib/ingestion/social-html-policy.ts), so Instagram,
 *   X and TikTok bios cannot be checked until an isolated provider exists.
 */
import { randomBytes } from 'node:crypto';
import { isCoreSocialHtmlHost } from '@/lib/ingestion/social-html-policy';

export const PROOF_CODE_PREFIX = 'jovie-verify-';
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 10;

/** `jovie-verify-` plus 10 unambiguous characters (about 50 bits). */
export function generateProofCode(
  random: Buffer = randomBytes(CODE_LENGTH)
): string {
  let suffix = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    suffix += CODE_ALPHABET[random[index] % CODE_ALPHABET.length];
  }
  return `${PROOF_CODE_PREFIX}${suffix}`;
}

export function isProofCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    new RegExp(`^${PROOF_CODE_PREFIX}[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(
      value
    )
  );
}

/** Case-insensitive match anywhere in the visible markup or its meta tags. */
export function pageContainsProofCode(html: string, code: string): boolean {
  if (!isProofCode(code)) return false;
  return html.toLowerCase().includes(code.toLowerCase());
}

/** Streaming and store hosts hold the artist's catalog, not their words. */
const NON_BIO_HOST_ROOTS = [
  'spotify.com',
  'apple.com',
  'music.amazon.com',
  'deezer.com',
  'tidal.com',
  'soundcloud.com',
  'bandcamp.com',
  'jov.ie',
] as const;

const PRIVATE_HOST_PATTERN =
  /^(localhost|.*\.local|.*\.internal|.*\.lan|.*\.home\.arpa)$/i;

function hostIsAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || PRIVATE_HOST_PATTERN.test(host)) return false;
  // IPv4 and IPv6 literals are never artist websites.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
  if (isCoreSocialHtmlHost(host)) return false;
  return !NON_BIO_HOST_ROOTS.some(
    root => host === root || host.endsWith(`.${root}`)
  );
}

export const MAX_PROOF_CANDIDATES = 3;

/**
 * Pages worth checking, from URLs already stored on the resolved identity.
 * At most one page per host, at most {@link MAX_PROOF_CANDIDATES}.
 */
export function selectProofCandidateUrls(
  storedUrls: readonly string[]
): { readonly url: string; readonly host: string }[] {
  const seen = new Set<string>();
  const picked: { url: string; host: string }[] = [];
  for (const raw of storedUrls) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !hostIsAllowed(parsed.hostname)
    ) {
      continue;
    }
    const host = parsed.hostname.toLowerCase();
    if (seen.has(host)) continue;
    seen.add(host);
    parsed.hash = '';
    picked.push({ url: parsed.toString(), host });
    if (picked.length >= MAX_PROOF_CANDIDATES) break;
  }
  return picked;
}
