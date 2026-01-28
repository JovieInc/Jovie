/**
 * Linktree Profile Extraction
 *
 * Main extraction function for Linktree profiles.
 */

import {
  extractAndRankEmails,
  getBestContactEmail,
} from '@/lib/email/extraction';
import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import { normalizeString } from '@/lib/utils/string-utils';
import type { ExtractionResult } from '../../types';
import {
  createExtractionResult,
  extractMetaContent,
  extractScriptJson,
} from '../base';
import { HREF_REGEX, SKIP_HOSTS } from './config';
import {
  extractStructuredLinks,
  type LinktreePageProps,
  sanitizeAvatarUrl,
} from './helpers';
import { detectLinktreePaidTier } from './paid-tier';

/** Schemes that should be blocked for security and relevance */
const BLOCKED_SCHEMES = [
  'javascript:',
  'mailto:',
  'tel:',
  'data:',
  'vbscript:',
] as const;

/**
 * Check if a normalized href is a valid extractable URL.
 * Returns true if the URL should be extracted.
 */
function isExtractableHref(normalized: string): boolean {
  // Block dangerous schemes (case-insensitive via normalization)
  for (const scheme of BLOCKED_SCHEMES) {
    if (normalized.startsWith(scheme)) return false;
  }

  // Require explicit https scheme (reject http or protocol-relative)
  return normalized.startsWith('https://');
}

/**
 * Extracts profile data and links from Linktree HTML.
 *
 * Handles multiple extraction methods:
 * 1. Open Graph / Twitter meta tags for display name and avatar
 * 2. href attributes for external links
 * 3. JSON-LD structured data (if present)
 */
export function extractLinktree(html: string): ExtractionResult {
  const nextData = extractScriptJson<LinktreePageProps>(html, '__NEXT_DATA__');

  const nextDisplayName =
    nextData?.props?.pageProps?.seo?.title ??
    nextData?.props?.pageProps?.user?.fullName ??
    nextData?.props?.pageProps?.account?.displayName ??
    null;

  const domAvatarMatch = html.match(
    /id=["']profile-picture["'][^>]*\s(?:src|data-src)=["']([^"']+)["']/i
  );
  const domAvatar = sanitizeAvatarUrl(domAvatarMatch?.[1] ?? null);

  const nextAvatar = sanitizeAvatarUrl(
    nextData?.props?.pageProps?.seo?.image ??
      nextData?.props?.pageProps?.user?.profilePicture?.url ??
      nextData?.props?.pageProps?.account?.profilePicture ??
      null
  );

  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();

  const addLink = (
    rawUrl: string | undefined | null,
    title?: string | null
  ) => {
    if (!rawUrl) return;

    try {
      const normalizedHref = normalizeUrl(rawUrl);
      const parsed = new URL(normalizedHref);

      // Require https and skip internal Linktree or asset hosts
      if (parsed.protocol !== 'https:') return;
      if (SKIP_HOSTS.has(parsed.hostname.toLowerCase())) return;

      const detected = detectPlatform(normalizedHref);
      if (!detected.isValid) return;

      const key = canonicalIdentity({
        platform: detected.platform,
        normalizedUrl: detected.normalizedUrl,
      });
      if (seen.has(key)) return;
      seen.add(key);

      links.push({
        url: detected.normalizedUrl,
        platformId: detected.platform.id,
        title: detected.suggestedTitle ?? title ?? undefined,
        sourcePlatform: 'linktree',
        evidence: {
          sources: ['linktree'],
          signals: ['linktree_profile_link'],
        },
      });
    } catch {
      // Skip unparseable URLs
      return;
    }
  };

  for (const structuredLink of extractStructuredLinks(nextData)) {
    addLink(structuredLink.url, structuredLink.title);
  }

  // Fallback: extract href attributes to maintain recall
  HREF_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_REGEX.exec(html)) !== null) {
    const rawHref = match[1];
    if (!rawHref || rawHref.startsWith('#')) continue;

    // Normalize and validate the href
    const normalized = normalizeString(rawHref);
    if (!isExtractableHref(normalized)) continue;

    addLink(rawHref);
  }

  // Extract display name from meta tags
  let displayName =
    nextDisplayName ??
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;

  // Clean up display name (remove " | Linktree" suffix if present)
  if (displayName) {
    const safeDisplayName = displayName.slice(0, 200);
    displayName = safeDisplayName
      .replace(/\s*\|\s*Linktree$/i, '')
      .replace(/\s*-\s*Linktree$/i, '')
      .trim();
  }

  if (displayName && /links?\b/i.test(displayName) && nextData?.query?.handle) {
    displayName = nextData.query.handle;
  }

  // Extract avatar from Next.js data or meta tags
  const avatarUrl =
    domAvatar ??
    nextAvatar ??
    sanitizeAvatarUrl(extractMetaContent(html, 'og:image')) ??
    sanitizeAvatarUrl(extractMetaContent(html, 'twitter:image')) ??
    null;

  // Detect paid tier by checking for branding
  const hasPaidTier = detectLinktreePaidTier(html);

  // Extract bio/description from Next.js data (using type assertions for optional fields)
  const pageProps = nextData?.props?.pageProps as
    | {
        user?: { description?: string | null };
        account?: { description?: string | null };
        seo?: { description?: string | null };
      }
    | undefined;

  const bio =
    pageProps?.user?.description ??
    pageProps?.account?.description ??
    pageProps?.seo?.description ??
    extractMetaContent(html, 'og:description') ??
    null;

  // Extract contact email from bio, HTML, and link titles
  const linkTitles = links.map(l => l.title).filter((t): t is string => !!t);
  const extractedEmails = extractAndRankEmails({
    bio,
    html,
    linkTitles,
  });
  const contactEmail = getBestContactEmail(extractedEmails);

  const result = createExtractionResult(
    links,
    displayName,
    avatarUrl,
    hasPaidTier
  );

  // Add bio and contact email to result
  return {
    ...result,
    bio,
    contactEmail,
  };
}
