/**
 * Extract a candidate bio from raw HTML for chat-driven bio import.
 *
 * Priority:
 *   1. JSON-LD Person/MusicGroup/ProfilePage `description`
 *   2. og:description
 *   3. <meta name="description">
 *
 * The "first non-trivial <p> in <main>/<article>" fallback was deliberately
 * cut: highest prompt-injection surface, lowest signal. "I couldn't find a
 * bio, paste it" is a better fallback than picking a random paragraph.
 *
 * The result is sanitized before any model sees it: URLs stripped, control
 * chars stripped, length capped at 600 chars at a word boundary.
 */

import { extractMetaContent } from '@/lib/ingestion/strategies/base/parsing';

export const BIO_MAX_LENGTH = 600;

const BIO_PRIORITY_TYPES = new Set(['Person', 'MusicGroup', 'ProfilePage']);

interface JsonLdNode {
  '@type'?: string | string[];
  '@graph'?: unknown;
  description?: unknown;
  [key: string]: unknown;
}

function flattenJsonLdCandidates(node: unknown): JsonLdNode[] {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.flatMap(flattenJsonLdCandidates);
  }
  if (typeof node !== 'object') return [];

  const obj = node as JsonLdNode;
  const collected: JsonLdNode[] = [obj];
  if (obj['@graph']) {
    collected.push(...flattenJsonLdCandidates(obj['@graph']));
  }
  return collected;
}

function nodeMatchesPriorityType(node: JsonLdNode): boolean {
  const type = node['@type'];
  if (!type) return false;
  if (Array.isArray(type)) {
    return type.some(t => typeof t === 'string' && BIO_PRIORITY_TYPES.has(t));
  }
  return typeof type === 'string' && BIO_PRIORITY_TYPES.has(type);
}

function extractJsonLdDescription(html: string): string | null {
  const blockPattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(blockPattern)) {
    const raw = match[1];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }

    const candidates = flattenJsonLdCandidates(parsed);
    for (const candidate of candidates) {
      if (!nodeMatchesPriorityType(candidate)) continue;
      if (typeof candidate.description === 'string') {
        const trimmed = candidate.description.trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return null;
}

function extractMetaDescription(html: string): string | null {
  return (
    extractMetaContent(html, 'og:description') ??
    extractMetaContent(html, 'description') ??
    extractMetaContent(html, 'twitter:description') ??
    null
  );
}

// URL stripping. Both branches are bounded with `{1,N}` quantifiers so a
// pathological input cannot trigger super-linear regex backtracking on the
// scheme/`www.` branch. The 2048-char cap is generous for any real URL while
// keeping worst-case match work bounded; the bare-domain branch caps at the
// DNS hostname max of 253 chars.
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>"']{1,2048}|[a-z0-9.-]{1,253}\.(?:com|net|org|io|co|me|app|dev|ai|fm|tv|gg|xyz)\b/gi;

// C0 controls (\x00-\x1f), DEL (\x7f), and C1 controls (\x80-\x9f) get
// collapsed to a single space. Tab/newline/CR fall under C0 and are
// intentionally normalized for readable bios.
const CONTROL_PATTERN = /[\x00-\x1f\x7f-\x9f]/g;

// Zero-width and bidi-control chars commonly used to hide payloads in scraped
// text or pull off "trojan source" tricks. Built via `new RegExp(string)` with
// `\\u` escapes so this source file itself contains no bidi chars (the very
// thing we strip at runtime). Biome's regex-literal formatter rewrites `\u`
// escapes inside character classes back to literal chars, which is exactly
// the situation we are trying to avoid here.
//   U+200B-U+200F  zero-width space, ZWNJ, ZWJ, LRM, RLM
//   U+202A-U+202E  bidi embedding/override controls
//   U+2060-U+206F  word joiner + invisible math/format chars
//   U+FEFF         BOM / zero-width no-break space
const ZERO_WIDTH_PATTERN = new RegExp(
  '[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F\\uFEFF]',
  'g'
);

/**
 * Strip URLs, control chars, and zero-width chars; collapse whitespace; cap at
 * `maxLength` at a word boundary. Shared by bio extraction and title sanitation
 * so external metadata hits the same defense pipeline before reaching the user.
 */
export function sanitizeText(input: string, maxLength: number): string {
  let cleaned = input
    .replaceAll(CONTROL_PATTERN, ' ')
    .replaceAll(ZERO_WIDTH_PATTERN, '');
  cleaned = cleaned.replaceAll(URL_PATTERN, ' ');
  cleaned = cleaned.replaceAll(/\s+/g, ' ').trim();

  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength);
  const lastBoundary = slice.lastIndexOf(' ');
  const cutoff =
    lastBoundary >= Math.floor(maxLength / 2) ? lastBoundary : slice.length;
  return `${slice.slice(0, cutoff).trimEnd()}…`;
}

export function sanitizeBioText(input: string): string {
  return sanitizeText(input, BIO_MAX_LENGTH);
}

/**
 * Extract a candidate bio from HTML and return it sanitized, or null if no
 * usable bio could be found.
 */
export function extractBioCandidate(html: string): string | null {
  const raw =
    extractJsonLdDescription(html) ?? extractMetaDescription(html) ?? null;
  if (!raw) return null;

  const sanitized = sanitizeBioText(raw);
  return sanitized.length > 0 ? sanitized : null;
}
