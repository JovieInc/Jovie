/**
 * GEO (generative engine optimization) checks for the `seo:certify` sweep.
 *
 * Answer engines quote pages that state the answer early, declare what the
 * page is in JSON-LD, sit in a linked cluster of sibling pages, and show when
 * time-sensitive content was last revised. These are pure checks over the same
 * rendered HTML snapshot as lib/seo/page-certification.ts and report in its
 * `SeoCheck` shape under the `geo` dimension.
 */
import {
  type ExtractedSeoHead,
  elementContents,
  findTags,
  htmlToText,
  pageOwnedHtml,
  type SeoCheck,
  type SeoCheckStatus,
} from '@/lib/seo/page-certification';

/** The answer must start within this many page-owned words. */
export const DIRECT_ANSWER_WORD_WINDOW = 100;
/** A paragraph shorter than this is a tagline, not an answer. */
export const DIRECT_ANSWER_MIN_WORDS = 8;
/** Sibling links in page content (FactorySeoAgentSchema wants 3-5). */
export const SIBLING_LINK_RANGE = { min: 3, max: 5 } as const;

/**
 * Page families decide which schema.org types are appropriate and whether a
 * visible revision date is required. Derived from the manifest recipe, with
 * path overrides for exempt editorial routes.
 */
export type GeoPageFamily =
  | 'home'
  | 'pricing'
  | 'product'
  | 'comparison'
  | 'hub'
  | 'article'
  | 'changelog'
  | 'company'
  | 'other';

export interface GeoFamilyRule {
  /** Any one of these JSON-LD types satisfies the family. Empty = any type. */
  readonly jsonLdAnyOf: readonly string[];
  readonly requiresLastUpdated: boolean;
}

export const GEO_FAMILY_RULES: Readonly<Record<GeoPageFamily, GeoFamilyRule>> =
  {
    home: {
      jsonLdAnyOf: ['Organization', 'WebSite'],
      requiresLastUpdated: false,
    },
    pricing: {
      jsonLdAnyOf: ['Offer', 'AggregateOffer'],
      requiresLastUpdated: false,
    },
    product: {
      jsonLdAnyOf: [
        'SoftwareApplication',
        'WebApplication',
        'MobileApplication',
        'Product',
        'Service',
      ],
      requiresLastUpdated: false,
    },
    comparison: {
      jsonLdAnyOf: ['WebPage', 'Article', 'ItemList', 'FAQPage', 'Table'],
      requiresLastUpdated: true,
    },
    hub: {
      jsonLdAnyOf: ['CollectionPage', 'Blog', 'ItemList', 'WebPage'],
      requiresLastUpdated: false,
    },
    article: {
      jsonLdAnyOf: ['Article', 'BlogPosting', 'TechArticle', 'NewsArticle'],
      requiresLastUpdated: true,
    },
    changelog: {
      jsonLdAnyOf: [],
      requiresLastUpdated: true,
    },
    company: {
      jsonLdAnyOf: [
        'AboutPage',
        'ContactPage',
        'FAQPage',
        'Organization',
        'WebPage',
        'SoftwareApplication',
        'TechArticle',
      ],
      requiresLastUpdated: false,
    },
    other: { jsonLdAnyOf: [], requiresLastUpdated: false },
  };

const RECIPE_FAMILY: Readonly<Record<string, GeoPageFamily>> = {
  homepage: 'home',
  pricing: 'pricing',
  'artist-lp': 'product',
  feature: 'product',
  launch: 'product',
  'agency-lp': 'product',
  enterprise: 'product',
  comparison: 'comparison',
  'blog-landing': 'hub',
  seo: 'company',
};

export function geoFamilyFor(
  pathname: string,
  recipeId: string | undefined
): GeoPageFamily {
  if (/^\/changelog(?:\/|$)/.test(pathname)) return 'changelog';
  if (/^\/(?:blog|engineering)\/(?!category\/|authors\/)[^/]+$/.test(pathname))
    return 'article';
  if (recipeId && RECIPE_FAMILY[recipeId]) return RECIPE_FAMILY[recipeId];
  if (pathname === '/compare' || pathname === '/alternatives') return 'hub';
  if (/^\/(?:compare|alternatives)\//.test(pathname)) return 'comparison';
  if (/^\/(?:developers|api-versioning|cli|support|about)$/.test(pathname))
    return 'company';
  return 'other';
}

export interface GeoPageContext {
  readonly pathname: string;
  readonly family: GeoPageFamily;
  readonly siteOrigin: string;
  /** Whether a pathname is a known public marketing page (sibling target). */
  readonly isSiblingPath: (pathname: string) => boolean;
}

function geo(
  id: string,
  status: SeoCheckStatus,
  summary: string,
  remediation?: string
): SeoCheck {
  return remediation
    ? { dimension: 'geo', id, status, summary, remediation }
    : { dimension: 'geo', id, status, summary };
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Paragraphs in page-owned content with the word offset at which each starts.
 * Headings and taglines ahead of the first paragraph count toward the offset.
 */
/**
 * Reading order as a crawler sees the finished page: each streamed Suspense
 * segment (`<div hidden id="S:n">`, swapped in by `$RC("B:n","S:n")`) replaces
 * its fallback (`<template id="B:n"></template>...<!--/$-->`) in place.
 */
export function inlineStreamedSegments(html: string): string {
  let output = html;
  for (const match of html.matchAll(/\$RC\("(B:\d+)","(S:\d+)"\)/g)) {
    const [, boundary, segment] = match;
    const open = `<div hidden id="${segment}">`;
    const segmentStart = output.indexOf(open);
    const scriptAt = output.indexOf(match[0]);
    const segmentEnd = output.lastIndexOf('</div>', scriptAt);
    const fallbackStart = output.indexOf(
      `<template id="${boundary}"></template>`
    );
    const fallbackEnd = output.indexOf('<!--/$-->', fallbackStart);
    if (
      segmentStart === -1 ||
      segmentEnd < segmentStart ||
      fallbackStart === -1 ||
      fallbackEnd === -1 ||
      fallbackEnd > segmentStart
    ) {
      continue;
    }
    const content = output.slice(segmentStart + open.length, segmentEnd);
    output = `${output.slice(0, fallbackStart)}${content}${output.slice(fallbackEnd, segmentStart)}${output.slice(segmentEnd + '</div>'.length)}`;
  }
  return output;
}

/** Screen-reader-hidden spans (layout placeholders) are not visible copy. */
const ARIA_HIDDEN_SPAN =
  /<span\b[^>]*\baria-hidden="true"[^>]*>[^<]*<\/span>/gi;

export function paragraphsWithOffsets(
  html: string,
  maxOffset = Number.POSITIVE_INFINITY
): Array<{ readonly offset: number; readonly text: string }> {
  const scope = pageOwnedHtml(inlineStreamedSegments(html)).replace(
    ARIA_HIDDEN_SPAN,
    ' '
  );
  const lower = scope.toLowerCase();
  const results: Array<{ offset: number; text: string }> = [];
  let cursor = lower.indexOf('<p');
  while (cursor !== -1) {
    const next = lower.charAt(cursor + 2);
    const start = scope.indexOf('>', cursor);
    if (start === -1) break;
    if (next !== ' ' && next !== '>' && next !== '\n') {
      cursor = lower.indexOf('<p', start);
      continue;
    }
    const end = lower.indexOf('</p>', start);
    if (end === -1) break;
    const offset = countWords(htmlToText(scope.slice(0, cursor)));
    if (offset >= maxOffset) break;
    results.push({ offset, text: htmlToText(scope.slice(start + 1, end)) });
    cursor = lower.indexOf('<p', end + 4);
  }
  return results;
}

export function auditDirectAnswer(html: string): SeoCheck {
  const answer = paragraphsWithOffsets(html, DIRECT_ANSWER_WORD_WINDOW).find(
    paragraph =>
      countWords(paragraph.text) >= DIRECT_ANSWER_MIN_WORDS &&
      /[.!?]["')\]]?$/.test(paragraph.text)
  );
  return answer
    ? geo(
        'geo-direct-answer',
        'passed',
        `answer paragraph at word ${answer.offset}: "${answer.text.slice(0, 80)}"`
      )
    : geo(
        'geo-direct-answer',
        'failed',
        `no complete ${DIRECT_ANSWER_MIN_WORDS}+ word paragraph starts in the first ${DIRECT_ANSWER_WORD_WINDOW} words`,
        'Open the page with a server-rendered <p> that answers what this page is and who it is for in one or two sentences.'
      );
}

export function auditCanonicalPresent(head: ExtractedSeoHead): SeoCheck {
  return head.canonical
    ? geo('geo-canonical', 'passed', `canonical ${head.canonical}`)
    : geo(
        'geo-canonical',
        'failed',
        'canonical link missing',
        'Set metadata.alternates.canonical; answer engines cite the canonical URL.'
      );
}

export function auditJsonLdForFamily(
  head: ExtractedSeoHead,
  family: GeoPageFamily
): SeoCheck {
  const rule = GEO_FAMILY_RULES[family];
  if (head.jsonLdTypes.length === 0) {
    return geo(
      'geo-jsonld-type',
      'failed',
      `no JSON-LD (${family} page)`,
      rule.jsonLdAnyOf.length > 0
        ? `Emit JSON-LD with one of: ${rule.jsonLdAnyOf.join(', ')}.`
        : 'Emit schema.org JSON-LD describing the page entity.'
    );
  }
  if (rule.jsonLdAnyOf.length === 0) {
    return geo('geo-jsonld-type', 'passed', `${family} page has JSON-LD`);
  }
  const match = rule.jsonLdAnyOf.find(type =>
    head.jsonLdNestedTypes.includes(type)
  );
  return match
    ? geo('geo-jsonld-type', 'passed', `${family} page declares ${match}`)
    : geo(
        'geo-jsonld-type',
        'failed',
        `${family} page declares ${[...new Set(head.jsonLdTypes)].join(', ')}, none of ${rule.jsonLdAnyOf.join(', ')}`,
        `Add a ${rule.jsonLdAnyOf[0]} node to the route JSON-LD.`
      );
}

/** Internal pathnames linked from `html`, normalized, in document order. */
export function internalLinkPaths(html: string, siteOrigin: string): string[] {
  const origin = new URL(siteOrigin).origin;
  const paths: string[] = [];
  for (const anchor of findTags(html, 'a')) {
    const href = anchor.href?.trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue;
    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    const path = trimTrailing(url.pathname, '/') || '/';
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

/** Distinct sibling marketing pages linked from page-owned content. */
export function siblingLinks(html: string, context: GeoPageContext): string[] {
  return internalLinkPaths(pageOwnedHtml(html), context.siteOrigin).filter(
    path => path !== context.pathname && context.isSiblingPath(path)
  );
}

export function auditSiblingLinks(
  html: string,
  context: GeoPageContext
): SeoCheck {
  const links = siblingLinks(html, context);
  return links.length >= SIBLING_LINK_RANGE.min
    ? geo(
        'geo-sibling-links',
        'passed',
        `${links.length} sibling links: ${links.slice(0, SIBLING_LINK_RANGE.max).join(', ')}`
      )
    : geo(
        'geo-sibling-links',
        'failed',
        `${links.length} sibling links in page content (need ${SIBLING_LINK_RANGE.min}-${SIBLING_LINK_RANGE.max})`,
        'Link 3-5 related Jovie pages from the page body; header and footer links do not count.'
      );
}

/** Strips trailing `chars` without a backtracking regex. */
export function trimTrailing(value: string, chars: string): string {
  let end = value.length;
  while (end > 0 && chars.includes(value.charAt(end - 1))) end -= 1;
  return value.slice(0, end);
}

const REVISION_KEYWORD =
  /\b(?:last updated|updated|last reviewed|published)\b/gi;
const REVISION_DATES = [
  /^[A-Z][a-z]{2,8}\.? \d{1,2},? \d{4}/,
  /^\d{1,2} [A-Z][a-z]{2,8} \d{4}/,
  /^\d{4}-\d{2}-\d{2}/,
];

/** "Last updated: Sep 1, 2026", "Published 2026-09-01", "Updated on 1 Sep 2026". */
export function hasRevisionDateText(text: string): boolean {
  for (const match of text.matchAll(REVISION_KEYWORD)) {
    let rest = text.slice(match.index + match[0].length, match.index + 60);
    rest = rest.replace(/^[\s:]*/, '');
    if (rest.toLowerCase().startsWith('on ')) rest = rest.slice(3);
    if (REVISION_DATES.some(date => date.test(rest))) return true;
  }
  return false;
}

export function hasVisibleRevisionDate(html: string): boolean {
  const scope = pageOwnedHtml(html);
  if (findTags(scope, 'time').some(time => Boolean(time.datetime))) return true;
  if (elementContents(scope, 'time').some(text => htmlToText(text).length > 0))
    return true;
  return hasRevisionDateText(htmlToText(scope));
}

export function auditLastUpdated(
  html: string,
  family: GeoPageFamily
): SeoCheck | null {
  if (!GEO_FAMILY_RULES[family].requiresLastUpdated) return null;
  return hasVisibleRevisionDate(html)
    ? geo('geo-last-updated', 'passed', 'visible revision date')
    : geo(
        'geo-last-updated',
        'failed',
        `${family} page shows no visible revision date`,
        'Render a <time datetime> "Last updated" line; answer engines discount undated comparisons and articles.'
      );
}

/** Per-page GEO checks. Orphan detection needs the whole sweep: see auditOrphans. */
export function auditGeo(
  html: string,
  head: ExtractedSeoHead,
  context: GeoPageContext
): SeoCheck[] {
  const checks = [
    auditDirectAnswer(html),
    auditCanonicalPresent(head),
    auditJsonLdForFamily(head, context.family),
    auditSiblingLinks(html, context),
  ];
  const lastUpdated = auditLastUpdated(html, context.family);
  return lastUpdated ? [...checks, lastUpdated] : checks;
}

/**
 * A sitemap page no other swept page links to (chrome included) is an orphan:
 * crawlers and answer engines only find it through the sitemap.
 */
export function auditOrphans(
  pages: ReadonlyArray<{
    readonly pathname: string;
    readonly html: string;
    readonly inSitemap: boolean;
  }>,
  siteOrigin: string
): Map<string, SeoCheck> {
  const inbound = new Map<string, Set<string>>();
  for (const page of pages) {
    for (const path of internalLinkPaths(page.html, siteOrigin)) {
      if (path === page.pathname) continue;
      const sources = inbound.get(path) ?? new Set<string>();
      sources.add(page.pathname);
      inbound.set(path, sources);
    }
  }
  const checks = new Map<string, SeoCheck>();
  for (const page of pages) {
    if (!page.inSitemap) continue;
    const sources = inbound.get(page.pathname);
    checks.set(
      page.pathname,
      sources && sources.size > 0
        ? geo(
            'geo-orphan',
            'passed',
            `linked from ${sources.size} swept page(s)`
          )
        : geo(
            'geo-orphan',
            'failed',
            'no swept page links here',
            'Link the page from its hub, a sibling page, or the footer.'
          )
    );
  }
  return checks;
}
