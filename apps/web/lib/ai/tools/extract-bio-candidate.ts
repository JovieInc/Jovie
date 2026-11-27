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
 * chars stripped, length capped to the profile field limit at a word boundary.
 */

import { extractMetaContent } from '@/lib/ingestion/strategies/base/parsing';
import { PROFILE_BIO_MAX_LENGTH } from '@/lib/validation/schemas/dashboard/profile';
import { normalizeImportedBioText, stripInvisibleCharacters } from './bio-text';

export const BIO_MAX_LENGTH = PROFILE_BIO_MAX_LENGTH;

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

function findDescriptionInCandidates(candidates: JsonLdNode[]): string | null {
  for (const candidate of candidates) {
    if (!nodeMatchesPriorityType(candidate)) continue;
    if (typeof candidate.description === 'string') {
      const trimmed = candidate.description.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
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
    const result = findDescriptionInCandidates(flattenJsonLdCandidates(parsed));
    if (result) return result;
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

/**
 * Strip URLs, control chars, and zero-width chars; collapse whitespace; cap at
 * `maxLength` at a word boundary. Shared by bio extraction and title sanitation
 * so external metadata hits the same defense pipeline before reaching the user.
 */
export function sanitizeText(input: string, maxLength: number): string {
  let cleaned = stripInvisibleCharacters(
    input.replaceAll(CONTROL_PATTERN, ' ')
  );
  cleaned = cleaned.replaceAll(URL_PATTERN, ' ');
  cleaned = cleaned.replaceAll(/\s+/g, ' ').trim();

  return truncateText(cleaned, maxLength);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const slice = text.slice(0, Math.max(0, maxLength - 1));
  const lastBoundary = slice.lastIndexOf(' ');
  const cutoff =
    lastBoundary >= Math.floor(maxLength / 2) ? lastBoundary : slice.length;
  return `${slice.slice(0, cutoff).trimEnd()}…`;
}

export function sanitizeBioText(input: string): string {
  return truncateText(cleanBioText(input), BIO_MAX_LENGTH);
}

function cleanBioText(input: string): string {
  return normalizeImportedBioText(input)
    .split(/\n+/)
    .map(paragraph => sanitizeText(paragraph, Number.MAX_SAFE_INTEGER))
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Extract a candidate bio from HTML and return it sanitized, or null if no
 * usable bio could be found.
 */
export function extractBioCandidate(html: string): string | null {
  return extractBioCandidateDetails(html)?.bio ?? null;
}

export function extractBioCandidateDetails(
  html: string
): { bio: string; truncated: boolean } | null {
  const raw =
    extractJsonLdDescription(html) ?? extractMetaDescription(html) ?? null;
  if (!raw) return null;

  const cleaned = cleanBioText(raw);
  return cleaned.length > 0
    ? {
        bio: truncateText(cleaned, BIO_MAX_LENGTH),
        truncated: cleaned.length > BIO_MAX_LENGTH,
      }
    : null;
}
