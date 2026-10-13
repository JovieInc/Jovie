/**
 * Per-page SEO + agent-readiness + copy certification.
 *
 * Pure evaluators over a rendered HTML snapshot. They emit receipts shaped for
 * the `jovie.certification/v1` kernel (`invariant_evaluation` tier, receipt ids
 * `seo.technical`, `seo.agentic`, `seo.copy`, `seo.geo`) so the certification ledger and
 * Summer consume one evidence envelope instead of a second SEO registry.
 *
 * Producers: the blog content source test and the manifest-wide
 * `pnpm --filter web seo:certify` sweep (JOV-7249), which adds the `geo`
 * dimension from lib/seo/geo-certification.ts.
 */
import { type CopyRegister, lintCopy } from '@jovie/copy';
import type { CertificationEvidenceReceipt } from '@/lib/agent-os/certification';

export const SEO_CERTIFICATION_CONTRACT = 'jovie.seo-certification/v1' as const;

export const SEO_CHECK_DIMENSIONS = [
  'technical',
  'agentic',
  'copy',
  'geo',
] as const;
export type SeoCheckDimension = (typeof SEO_CHECK_DIMENSIONS)[number];

/** `warn` is advisory: it never fails a page, it ranks the backlog. */
export type SeoCheckStatus = 'passed' | 'failed' | 'warn';

export interface SeoCheck {
  readonly id: string;
  readonly dimension: SeoCheckDimension;
  readonly status: SeoCheckStatus;
  readonly summary: string;
  readonly remediation?: string;
}

export type SeoPageSurface =
  | 'home'
  | 'marketing'
  | 'blog'
  | 'docs'
  | 'legal'
  | 'profile'
  | 'smart_link';

export const TITLE_LENGTH = { min: 10, max: 65 } as const;
export const DESCRIPTION_LENGTH = { min: 50, max: 170 } as const;
/**
 * Server-rendered words below this read as a JS-only shell to crawlers and
 * agents. Smart links and profiles are link pages: a title, an artist, and
 * destinations, so their floor only catches an empty shell.
 */
export const MIN_SERVER_RENDERED_WORDS = 40;
export const MIN_LINK_PAGE_WORDS = 10;
/** Domain-level `is-agentic` floor. The weekly loop closes only at 100/100. */
export const IS_AGENTIC_SCORE_FLOOR = 100;

/** Pages whose copy runs the flagship judge panel in the authoring loop. */
export const FLAGSHIP_PATHS: ReadonlySet<string> = new Set([
  '/',
  '/pricing',
  '/artist-profiles',
  '/smart-links',
]);

export interface ExtractedSeoHead {
  readonly lang: string | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly canonical: string | null;
  readonly robots: string | null;
  readonly ogTitle: string | null;
  readonly ogDescription: string | null;
  readonly ogImage: string | null;
  readonly twitterCard: string | null;
  readonly hreflang: readonly { lang: string; href: string }[];
  /** Top-level `@type`s (including `@graph` members). */
  readonly jsonLdTypes: readonly string[];
  /** Every `@type` at any depth, e.g. an Offer nested in `mainEntity`. */
  readonly jsonLdNestedTypes: readonly string[];
  /** Parsed JSON-LD documents (roots only; `@graph` stays nested inside). */
  readonly jsonLdDocuments: readonly unknown[];
  readonly jsonLdErrors: number;
  /** `href` of a `<link rel="alternate" type="text/markdown">`, when present. */
  readonly markdownAlternate: string | null;
  readonly h1Count: number;
  readonly visibleText: string;
}

// ---------------------------------------------------------------------------
// HTML extraction (linear scans; no DOM dependency so the sweep stays cheap)
// ---------------------------------------------------------------------------

const ENTITY_MAP: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  '#39': "'",
  '#x27': "'",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#?\w{1,8});/g, (whole, name: string) => {
    const mapped = ENTITY_MAP[name.toLowerCase()];
    if (mapped !== undefined) return mapped;
    if (/^#\d+$/.test(name)) return String.fromCodePoint(Number(name.slice(1)));
    if (/^#x[0-9a-f]+$/i.test(name))
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    return whole;
  });
}

/** Opening tags named `tag` with their parsed attributes. */
export function findTags(
  html: string,
  tag: string
): Array<Record<string, string>> {
  const results: Array<Record<string, string>> = [];
  const lower = html.toLowerCase();
  const needle = `<${tag}`;
  let cursor = lower.indexOf(needle);
  while (cursor !== -1) {
    const after = lower.charAt(cursor + needle.length);
    const end = html.indexOf('>', cursor);
    if (end === -1) break;
    if (after === ' ' || after === '>' || after === '/' || after === '\n') {
      results.push(parseAttributes(html.slice(cursor + needle.length, end)));
    }
    cursor = lower.indexOf(needle, end);
  }
  return results;
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(
    /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  )) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** Inner contents of every `<tag>...</tag>` element (non-nested tags only). */
export function elementContents(html: string, tag: string): string[] {
  const contents: string[] = [];
  const lower = html.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let cursor = lower.indexOf(open);
  while (cursor !== -1) {
    const next = lower.charAt(cursor + open.length);
    const start = html.indexOf('>', cursor);
    if (start === -1) break;
    if (next !== ' ' && next !== '>' && next !== '\n') {
      cursor = lower.indexOf(open, start);
      continue;
    }
    const end = lower.indexOf(close, start);
    if (end === -1) break;
    contents.push(html.slice(start + 1, end));
    cursor = lower.indexOf(open, end + close.length);
  }
  return contents;
}

function removeElements(html: string, tags: readonly string[]): string {
  let output = html;
  for (const tag of tags) {
    const lower = () => output.toLowerCase();
    const open = `<${tag}`;
    const close = `</${tag}>`;
    let cursor = lower().indexOf(open);
    while (cursor !== -1) {
      const next = lower().charAt(cursor + open.length);
      if (next !== ' ' && next !== '>' && next !== '\n') {
        cursor = lower().indexOf(open, cursor + open.length);
        continue;
      }
      const end = lower().indexOf(close, cursor);
      if (end === -1) break;
      output = `${output.slice(0, cursor)} ${output.slice(end + close.length)}`;
      cursor = lower().indexOf(open, cursor);
    }
  }
  return output;
}

function stripTags(html: string): string {
  let text = '';
  let inTag = false;
  for (const char of html) {
    if (char === '<') {
      inTag = true;
      text += ' ';
    } else if (char === '>') {
      inTag = false;
    } else if (!inTag) {
      text += char;
    }
  }
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

/**
 * Page-owned visible text: the body minus scripts and shared chrome. Streamed
 * Suspense segments (`<div hidden id="S:0">`) count: they are server-rendered
 * HTML that agents and crawlers receive without running client JS.
 */
export function extractVisibleText(html: string): string {
  return stripTags(pageOwnedHtml(html));
}

/**
 * Body HTML the page owns: no code, no head, no shared header/nav/footer
 * chrome. GEO checks read links and paragraphs from this scope.
 */
export function pageOwnedHtml(html: string): string {
  const withoutCode = removeElements(html, [
    'script',
    'style',
    'noscript',
    'template',
    'svg',
    'head',
  ]);
  const scope = elementContents(withoutCode, 'body')[0] ?? withoutCode;
  return removeElements(scope, ['header', 'nav', 'footer']);
}

/** Tag-stripped, entity-decoded, whitespace-collapsed text. */
export function htmlToText(html: string): string {
  return stripTags(html);
}

function metaContent(
  metas: ReadonlyArray<Record<string, string>>,
  key: string
): string | null {
  const match = metas.find(
    meta =>
      meta.name?.toLowerCase() === key || meta.property?.toLowerCase() === key
  );
  const value = match?.content?.trim();
  return value ? value : null;
}

function collectJsonLdTypes(node: unknown, types: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdTypes(item, types);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') types.push(type);
  if (Array.isArray(type))
    for (const item of type) if (typeof item === 'string') types.push(item);
  if (record['@graph']) collectJsonLdTypes(record['@graph'], types);
}

function collectNestedJsonLdTypes(node: unknown, types: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectNestedJsonLdTypes(item, types);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const type = (node as Record<string, unknown>)['@type'];
  if (typeof type === 'string') types.push(type);
  if (Array.isArray(type))
    for (const item of type) if (typeof item === 'string') types.push(item);
  for (const [key, value] of Object.entries(node)) {
    if (key !== '@type') collectNestedJsonLdTypes(value, types);
  }
}

function jsonLdBlocks(html: string): {
  types: string[];
  nestedTypes: string[];
  documents: unknown[];
  errors: number;
} {
  const types: string[] = [];
  const nestedTypes: string[] = [];
  const documents: unknown[] = [];
  let errors = 0;
  const lower = html.toLowerCase();
  let cursor = lower.indexOf('<script');
  while (cursor !== -1) {
    const start = html.indexOf('>', cursor);
    const end = lower.indexOf('</script>', start);
    if (start === -1 || end === -1) break;
    const attributes = parseAttributes(html.slice(cursor + 7, start));
    if (attributes.type?.toLowerCase() === 'application/ld+json') {
      try {
        const parsed: unknown = JSON.parse(html.slice(start + 1, end));
        documents.push(parsed);
        collectJsonLdTypes(parsed, types);
        collectNestedJsonLdTypes(parsed, nestedTypes);
      } catch {
        errors += 1;
      }
    }
    cursor = lower.indexOf('<script', end);
  }
  return { types, nestedTypes, documents, errors };
}

export function extractSeoHead(html: string): ExtractedSeoHead {
  const metas = findTags(html, 'meta');
  const links = findTags(html, 'link');
  const titleText = elementContents(html, 'title')[0];
  const canonical = links.find(link =>
    link.rel?.toLowerCase().split(/\s+/).includes('canonical')
  );
  const jsonLd = jsonLdBlocks(html);
  const markdownAlternate = links.find(
    link =>
      link.rel?.toLowerCase().split(/\s+/).includes('alternate') &&
      link.type?.toLowerCase().split(';')[0]?.trim() === 'text/markdown'
  );
  return {
    lang: findTags(html, 'html')[0]?.lang?.trim() || null,
    title: titleText ? decodeEntities(titleText).trim() || null : null,
    description: metaContent(metas, 'description'),
    canonical: canonical?.href?.trim() || null,
    robots: metaContent(metas, 'robots'),
    ogTitle: metaContent(metas, 'og:title'),
    ogDescription: metaContent(metas, 'og:description'),
    ogImage: metaContent(metas, 'og:image'),
    twitterCard: metaContent(metas, 'twitter:card'),
    hreflang: links
      .filter(
        link =>
          link.rel?.toLowerCase() === 'alternate' && link.hreflang && link.href
      )
      .map(link => ({ lang: link.hreflang ?? '', href: link.href ?? '' })),
    jsonLdTypes: jsonLd.types,
    jsonLdNestedTypes: [...new Set(jsonLd.nestedTypes)],
    jsonLdDocuments: jsonLd.documents,
    jsonLdErrors: jsonLd.errors,
    markdownAlternate: markdownAlternate?.href?.trim() || null,
    h1Count: findTags(html, 'h1').length,
    visibleText: extractVisibleText(html),
  };
}

// ---------------------------------------------------------------------------
// Surface classification
// ---------------------------------------------------------------------------

const MARKETING_PREFIXES = [
  '/about',
  '/ai',
  '/alternatives',
  '/api-versioning',
  '/artist-',
  '/card',
  '/changelog',
  '/cli',
  '/compare',
  '/developers',
  '/download',
  '/engineering',
  '/instant-merch',
  '/launch',
  '/new',
  '/pay',
  '/pricing',
  '/product',
  '/smart-links',
  '/solutions',
  '/voice',
  '/youtube-thumbnails',
  '/artists',
];

export function classifySurface(pathname: string): SeoPageSurface {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname === '/integrations') return 'marketing';
  if (pathname.startsWith('/blog')) return 'blog';
  if (pathname.startsWith('/support') || pathname.startsWith('/docs'))
    return 'docs';
  if (pathname.startsWith('/legal')) return 'legal';
  if (MARKETING_PREFIXES.some(prefix => pathname.startsWith(prefix)))
    return 'marketing';
  // `/{username}/{release}` style smart links vs. `/{username}` profiles.
  return pathname.split('/').filter(Boolean).length > 1
    ? 'smart_link'
    : 'profile';
}

/** Artist-authored surfaces speak in the customer's voice: floor rules only. */
export function copyRegisterFor(surface: SeoPageSurface): CopyRegister {
  return surface === 'profile' || surface === 'smart_link'
    ? 'customer-voice'
    : 'jovie-marketing';
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface SeoPageSnapshot {
  readonly url: string;
  readonly status: number;
  readonly html: string;
  /** `X-Robots-Tag` response header, when present. */
  readonly xRobotsTag?: string | null;
}

export interface SeoPageContext {
  /** Canonical production origin, e.g. `https://jov.ie`. */
  readonly siteOrigin: string;
  readonly inSitemap: boolean;
  readonly robotsDisallowed?: boolean;
}

function check(
  dimension: SeoCheckDimension,
  id: string,
  status: SeoCheckStatus,
  summary: string,
  remediation?: string
): SeoCheck {
  return remediation
    ? { dimension, id, status, summary, remediation }
    : { dimension, id, status, summary };
}

function lengthCheck(
  id: string,
  label: string,
  value: string | null,
  bounds: { readonly min: number; readonly max: number }
): SeoCheck {
  if (!value) {
    return check(
      'technical',
      id,
      'failed',
      `${label} missing`,
      `Add a ${label} in the route metadata export.`
    );
  }
  if (value.length < bounds.min || value.length > bounds.max) {
    return check(
      'technical',
      id,
      'warn',
      `${label} is ${value.length} chars (target ${bounds.min}-${bounds.max})`,
      `Rewrite the ${label} to ${bounds.min}-${bounds.max} characters; search engines truncate or rewrite outside that range.`
    );
  }
  return check('technical', id, 'passed', `${label} ${value.length} chars`);
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  const path =
    url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  return `${url.origin}${path}`;
}

function isNoindex(value: string | null | undefined): boolean {
  return Boolean(value && /\bnoindex\b|\bnone\b/i.test(value));
}

export function auditTechnicalSeo(
  snapshot: SeoPageSnapshot,
  head: ExtractedSeoHead,
  context: SeoPageContext
): SeoCheck[] {
  const checks: SeoCheck[] = [];
  checks.push(
    snapshot.status === 200
      ? check('technical', 'http-status', 'passed', 'HTTP 200')
      : check(
          'technical',
          'http-status',
          'failed',
          `HTTP ${snapshot.status}`,
          context.inSitemap
            ? 'Remove the URL from the sitemap or restore the page.'
            : 'Restore the page or return a permanent redirect.'
        )
  );
  if (snapshot.status !== 200) return checks;

  checks.push(lengthCheck('title', 'title', head.title, TITLE_LENGTH));
  checks.push(
    lengthCheck(
      'meta-description',
      'meta description',
      head.description,
      DESCRIPTION_LENGTH
    )
  );

  if (!head.canonical) {
    checks.push(
      check(
        'technical',
        'canonical',
        'failed',
        'canonical link missing',
        'Set metadata.alternates.canonical to the absolute production URL.'
      )
    );
  } else {
    let canonicalCheck: SeoCheck;
    try {
      const canonical = normalizeUrl(head.canonical);
      const expected = normalizeUrl(
        new URL(new URL(snapshot.url).pathname, context.siteOrigin).toString()
      );
      canonicalCheck =
        canonical === expected
          ? check('technical', 'canonical', 'passed', 'self-canonical')
          : check(
              'technical',
              'canonical',
              context.inSitemap ? 'failed' : 'warn',
              `canonical points to ${head.canonical}`,
              context.inSitemap
                ? 'A sitemap URL must be self-canonical. Fix the canonical or drop the URL from the sitemap.'
                : 'Confirm the canonical target is intentional.'
            );
    } catch {
      canonicalCheck = check(
        'technical',
        'canonical',
        'failed',
        `canonical is not an absolute URL: ${head.canonical}`,
        'Use an absolute https://jov.ie URL.'
      );
    }
    checks.push(canonicalCheck);
  }

  const noindex = isNoindex(head.robots) || isNoindex(snapshot.xRobotsTag);
  if (noindex && context.inSitemap) {
    checks.push(
      check(
        'technical',
        'indexability',
        'failed',
        'page is noindex but listed in the sitemap',
        'Either drop the URL from app/sitemap.ts or remove the noindex.'
      )
    );
  } else if (context.robotsDisallowed && context.inSitemap) {
    checks.push(
      check(
        'technical',
        'indexability',
        'failed',
        'robots.txt disallows a sitemap URL',
        'Align app/robots.ts DISALLOW_PATHS with app/sitemap.ts.'
      )
    );
  } else {
    checks.push(
      check(
        'technical',
        'indexability',
        'passed',
        noindex ? 'noindex (not in sitemap)' : 'indexable'
      )
    );
  }

  checks.push(
    context.inSitemap || noindex
      ? check(
          'technical',
          'sitemap',
          'passed',
          context.inSitemap ? 'in sitemap' : 'noindex, excluded'
        )
      : check(
          'technical',
          'sitemap',
          'warn',
          'indexable page missing from sitemap',
          'Add the route to app/sitemap.ts or mark it noindex.'
        )
  );

  const missingSocial = [
    head.ogTitle ? null : 'og:title',
    head.ogDescription ? null : 'og:description',
    head.ogImage ? null : 'og:image',
    head.twitterCard ? null : 'twitter:card',
  ].filter((value): value is string => value !== null);
  checks.push(
    missingSocial.length === 0
      ? check('technical', 'open-graph', 'passed', 'OG + Twitter card present')
      : check(
          'technical',
          'open-graph',
          missingSocial.includes('og:image') ||
            missingSocial.includes('og:title')
            ? 'failed'
            : 'warn',
          `missing ${missingSocial.join(', ')}`,
          'Fill metadata.openGraph and metadata.twitter for the route.'
        )
  );

  const badHreflang = head.hreflang.filter(entry => {
    try {
      return new URL(entry.href).protocol !== 'https:';
    } catch {
      return true;
    }
  });
  if (head.hreflang.length > 0) {
    checks.push(
      badHreflang.length === 0
        ? check(
            'technical',
            'hreflang',
            'passed',
            `${head.hreflang.length} alternates`
          )
        : check(
            'technical',
            'hreflang',
            'failed',
            `${badHreflang.length} hreflang href(s) not absolute https`,
            'Use absolute https URLs in metadata.alternates.languages.'
          )
    );
  }

  checks.push(
    head.lang
      ? check('technical', 'html-lang', 'passed', `lang=${head.lang}`)
      : check(
          'technical',
          'html-lang',
          'warn',
          'html lang missing',
          'Set lang on the root layout <html>.'
        )
  );
  checks.push(
    head.h1Count === 1
      ? check('technical', 'h1', 'passed', 'one h1')
      : check(
          'technical',
          'h1',
          'warn',
          `${head.h1Count} h1 elements`,
          'Render exactly one h1 that states the page topic.'
        )
  );
  return checks;
}

// ---------------------------------------------------------------------------
// JSON-LD property validation + rendered-copy parity (JOV-7259)
// Deterministic subset of the claude-seo rubric: parse-ability and type
// presence were already covered by `structured-data`; these checks cover what
// the graph actually claims.
// ---------------------------------------------------------------------------

/** Node types whose `name`/`description` must mirror the rendered metadata. */
const JSONLD_PAGE_ENTITY_TYPES = new Set([
  'WebPage',
  'AboutPage',
  'ContactPage',
  'CollectionPage',
  'FAQPage',
  'Article',
  'BlogPosting',
  'NewsArticle',
  'TechArticle',
]);

/** Minimum property checks for Jovie certification, not all schema.org constraints. */
const JSONLD_REQUIRED_PROPS: Readonly<Record<string, readonly string[]>> = {
  Offer: ['url'],
  Product: ['name'],
  ItemList: ['itemListElement'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
};

interface JsonLdNodeEntry {
  readonly node: Record<string, unknown>;
  readonly path: string;
}

function* walkJsonLd(node: unknown, path: string): Generator<JsonLdNodeEntry> {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries())
      yield* walkJsonLd(item, `${path}[${index}]`);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  yield { node: record, path };
  for (const [key, value] of Object.entries(record)) {
    if (key === '@context') continue;
    yield* walkJsonLd(value, `${path}.${key}`);
  }
}

function nodeTypes(node: Record<string, unknown>): string[] {
  const type = node['@type'];
  if (typeof type === 'string') return type.trim() ? [type] : [];
  if (Array.isArray(type))
    return type.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0
    );
  return [];
}

/** Common document shapes emitted by Jovie: typed roots, arrays, and graphs. */
function graphMembers(document: unknown, path = '$'): JsonLdNodeEntry[] {
  if (Array.isArray(document)) {
    if (document.length === 0) return [{ node: {}, path }];
    return document.flatMap((member, index) =>
      graphMembers(member, `${path}[${index}]`)
    );
  }
  if (!document || typeof document !== 'object') return [{ node: {}, path }];
  const node = document as Record<string, unknown>;
  if ('@graph' in node) {
    return [
      ...(nodeTypes(node).length > 0 ? [{ node, path }] : []),
      ...graphMembers(node['@graph'], `${path}.@graph`),
    ];
  }
  return [{ node, path }];
}

function absoluteSchemaUrl(value: unknown): boolean {
  if (Array.isArray(value))
    return value.length > 0 && value.every(absoluteSchemaUrl);
  if (value && typeof value === 'object') {
    return absoluteSchemaUrl((value as Record<string, unknown>)['@id']);
  }
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validSchemaProperty(prop: string, value: unknown): boolean {
  if (prop === 'url') return absoluteSchemaUrl(value);
  if (prop === 'name')
    return typeof value === 'string' && value.trim().length > 0;
  // Item lists and FAQ entities can be a single node or a nonempty node array.
  const members = Array.isArray(value) ? value : [value];
  return (
    members.length > 0 &&
    members.every(
      member =>
        member !== null &&
        typeof member === 'object' &&
        !Array.isArray(member) &&
        Object.keys(member).length > 0
    )
  );
}

function normalizeForParity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function parityMatch(claim: string, rendered: string | null): boolean {
  if (!rendered) return false;
  const a = normalizeForParity(claim);
  const b = normalizeForParity(rendered);
  return a.length > 0 && b.includes(a);
}

export function auditJsonLdSemantics(head: ExtractedSeoHead): SeoCheck[] {
  if (head.jsonLdDocuments.length === 0) return [];
  const checks: SeoCheck[] = [];

  // This is Jovie's typed-entity contract, not a complete JSON-LD validator.
  const untyped: string[] = [];
  for (const document of head.jsonLdDocuments) {
    for (const member of graphMembers(document)) {
      if (nodeTypes(member.node).length === 0) untyped.push(member.path);
    }
  }
  checks.push(
    untyped.length === 0
      ? check('agentic', 'jsonld-type', 'passed', 'every JSON-LD entity typed')
      : check(
          'agentic',
          'jsonld-type',
          'failed',
          `JSON-LD entities missing @type: ${untyped.slice(0, 5).join(', ')}`,
          'Emit typed entities in a root object, document array, or @graph container.'
        )
  );

  // Jovie certification requires absolute http(s) URL values so extracted
  // evidence remains unambiguous without carrying the originating document.
  const relativeUrls: string[] = [];
  for (const document of head.jsonLdDocuments) {
    for (const { node, path } of walkJsonLd(document, '$')) {
      if ('url' in node && !absoluteSchemaUrl(node.url)) {
        relativeUrls.push(`${path}.url`);
      }
    }
  }
  checks.push(
    relativeUrls.length === 0
      ? check(
          'agentic',
          'jsonld-absolute-url',
          'passed',
          'all JSON-LD url properties are absolute http(s)'
        )
      : check(
          'agentic',
          'jsonld-absolute-url',
          'failed',
          `non-absolute JSON-LD url at ${relativeUrls.slice(0, 5).join(', ')}`,
          'Emit absolute https://jov.ie URLs for schema.org url properties; certification requires unambiguous URLs.'
        )
  );

  const missingProps: string[] = [];
  for (const document of head.jsonLdDocuments) {
    for (const { node, path } of walkJsonLd(document, '$')) {
      for (const type of nodeTypes(node)) {
        for (const prop of JSONLD_REQUIRED_PROPS[type] ?? []) {
          const value = node[prop];
          if (!validSchemaProperty(prop, value))
            missingProps.push(`${type} ${path} missing or invalid ${prop}`);
        }
      }
    }
  }
  checks.push(
    missingProps.length === 0
      ? check(
          'agentic',
          'jsonld-required-props',
          'passed',
          'required JSON-LD properties present'
        )
      : check(
          'agentic',
          'jsonld-required-props',
          'warn',
          missingProps.slice(0, 5).join('; '),
          'Populate the required property; rich-result parsers skip incomplete nodes.'
        )
  );

  // Rendered-copy parity: a page-entity node that names or describes something
  // the rendered title/description never said is schema/body drift.
  const drifted: string[] = [];
  for (const document of head.jsonLdDocuments) {
    for (const { node, path } of graphMembers(document)) {
      if (!nodeTypes(node).some(type => JSONLD_PAGE_ENTITY_TYPES.has(type)))
        continue;
      if (
        typeof node.name === 'string' &&
        !parityMatch(node.name, head.title) &&
        !parityMatch(node.name, head.visibleText)
      ) {
        drifted.push(`${path} name "${node.name}" not in rendered copy`);
      }
      if (
        typeof node.description === 'string' &&
        !parityMatch(node.description, head.description) &&
        !parityMatch(node.description, head.visibleText)
      ) {
        drifted.push(`${path} description not in rendered copy`);
      }
    }
  }
  checks.push(
    drifted.length === 0
      ? check(
          'agentic',
          'jsonld-rendered-parity',
          'passed',
          'JSON-LD page entities match rendered metadata'
        )
      : check(
          'agentic',
          'jsonld-rendered-parity',
          'warn',
          `schema/body drift: ${drifted.slice(0, 3).join('; ')}`,
          'Align the JSON-LD page entity with the rendered title and meta description.'
        )
  );

  return checks;
}

export function auditAgentReadiness(
  head: ExtractedSeoHead,
  surface: SeoPageSurface
): SeoCheck[] {
  const checks: SeoCheck[] = [];
  if (head.jsonLdErrors > 0) {
    checks.push(
      check(
        'agentic',
        'structured-data',
        'failed',
        `${head.jsonLdErrors} JSON-LD block(s) fail to parse`,
        'Fix the JSON-LD serializer for this route.'
      )
    );
  } else if (head.jsonLdTypes.length === 0) {
    checks.push(
      check(
        'agentic',
        'structured-data',
        'failed',
        'no JSON-LD structured data',
        'Emit schema.org JSON-LD (WebPage, Article, MusicGroup, Product, FAQPage) so agents can parse the entity.'
      )
    );
  } else {
    checks.push(
      check(
        'agentic',
        'structured-data',
        'passed',
        `JSON-LD types (including nested): ${[...new Set(head.jsonLdNestedTypes)].slice(0, 8).join(', ')}`
      )
    );
  }
  const words = head.visibleText.split(/\s+/).filter(Boolean).length;
  const floor =
    surface === 'profile' || surface === 'smart_link'
      ? MIN_LINK_PAGE_WORDS
      : MIN_SERVER_RENDERED_WORDS;
  checks.push(
    words >= floor
      ? check(
          'agentic',
          'server-rendered-content',
          'passed',
          `${words} server-rendered words`
        )
      : check(
          'agentic',
          'server-rendered-content',
          'failed',
          `${words} server-rendered words`,
          'Render the page content on the server; agents and crawlers do not run client JS.'
        )
  );
  checks.push(...auditJsonLdSemantics(head));
  // Advisory only (JOV-7259): Markdown delivery is recorded until outcome
  // data justifies a gate.
  checks.push(
    head.markdownAlternate
      ? check(
          'agentic',
          'markdown-delivery',
          'passed',
          `markdown alternate advertised: ${head.markdownAlternate}`
        )
      : check(
          'agentic',
          'markdown-delivery',
          'warn',
          'no text/markdown alternate advertised; Accept negotiation and .md siblings not probed',
          'Advertise a Markdown representation via <link rel="alternate" type="text/markdown"> or Accept-header negotiation when the route serves one.'
        )
  );
  return checks;
}

export function auditPageCopy(
  head: ExtractedSeoHead,
  surface: SeoPageSurface,
  pathname: string
): SeoCheck[] {
  if (surface === 'legal') {
    // Legal text is counsel-owned and excluded from the copy gate (canon/VOICE.md).
    return [
      check(
        'copy',
        'copy-lint',
        'passed',
        'legal page: excluded from copy gate'
      ),
    ];
  }
  const register = copyRegisterFor(surface);
  const text = [head.title, head.description, head.visibleText]
    .filter(Boolean)
    .join('\n');
  const result = lintCopy(text, { register });
  const checks: SeoCheck[] = [
    result.ok
      ? check(
          'copy',
          'copy-lint',
          'passed',
          `@jovie/copy ${register}: no blocking findings`
        )
      : check(
          'copy',
          'copy-lint',
          'failed',
          `@jovie/copy ${register}: ${result.blocking.length} blocking (${[
            ...new Set(result.blocking.map(finding => finding.rule)),
          ]
            .slice(0, 5)
            .join(', ')})`,
          'Rewrite the flagged lines; floor and style rules cannot be waived (canon/VOICE.md).'
        ),
  ];
  if (FLAGSHIP_PATHS.has(pathname)) {
    // Flagship judge panels run in the authoring loop on subscriptions, never in
    // a sweep (copy-gate cost tiers). The sweep only records the requirement.
    checks.push(
      check(
        'copy',
        'copy-judge-flagship',
        'warn',
        'flagship page: judge panel receipt comes from the authoring loop',
        'Run `pnpm copy:judge --tier flagship` when this page copy changes.'
      )
    );
  }
  return checks;
}

// ---------------------------------------------------------------------------
// is-agentic (domain-level signal, npm `is-agentic`)
// ---------------------------------------------------------------------------

export interface IsAgenticIssue {
  readonly id: string;
  readonly name?: string;
  readonly result?: string;
  readonly tier?: string;
  readonly details?: string;
  readonly recommendation?: string;
}

export interface IsAgenticReport {
  readonly target: string;
  readonly score: number;
  readonly scanned_at?: string;
  readonly report_url?: string;
  readonly issues?: readonly IsAgenticIssue[];
}

export function parseIsAgenticReport(raw: unknown): IsAgenticReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.score !== 'number' || typeof record.target !== 'string')
    return null;
  return record as unknown as IsAgenticReport;
}

export function auditIsAgentic(
  report: IsAgenticReport | null,
  floor = IS_AGENTIC_SCORE_FLOOR
): SeoCheck[] {
  if (!report) {
    return [
      check(
        'agentic',
        'is-agentic-score',
        'failed',
        'is-agentic report unavailable',
        'Re-run `npx is-agentic@1.0.1 jov.ie --json`; a missing report fails closed.'
      ),
    ];
  }
  const essentialFailures = (report.issues ?? []).filter(
    issue =>
      issue.tier === 'essential' &&
      (issue.result === 'fail' || issue.result === 'failed')
  );
  const checks: SeoCheck[] = [
    report.score >= floor
      ? check(
          'agentic',
          'is-agentic-score',
          'passed',
          `is-agentic ${report.score}/100 (floor ${floor})`
        )
      : check(
          'agentic',
          'is-agentic-score',
          'failed',
          `is-agentic ${report.score}/100 below floor ${floor}`,
          `See ${report.report_url ?? 'https://is-agentic.com'} for the failing checks.`
        ),
    essentialFailures.length === 0
      ? check(
          'agentic',
          'is-agentic-essential',
          'passed',
          'no essential is-agentic failures'
        )
      : check(
          'agentic',
          'is-agentic-essential',
          'failed',
          `essential failures: ${essentialFailures.map(issue => issue.id).join(', ')}`,
          essentialFailures[0]?.recommendation
        ),
  ];
  for (const issue of report.issues ?? []) {
    if (
      issue.tier === 'essential' &&
      (issue.result === 'fail' || issue.result === 'failed')
    )
      continue;
    checks.push(
      check(
        'agentic',
        `is-agentic:${issue.id}`,
        'warn',
        `${issue.name ?? issue.id}: ${issue.result ?? 'partial'}`,
        issue.recommendation
      )
    );
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Page certification + kernel receipts
// ---------------------------------------------------------------------------

export interface SeoPageCertification {
  readonly url: string;
  readonly pathname: string;
  readonly surface: SeoPageSurface;
  readonly passed: boolean;
  readonly checks: readonly SeoCheck[];
}

export function certifyPage(
  snapshot: SeoPageSnapshot,
  context: SeoPageContext
): SeoPageCertification {
  const pathname = new URL(snapshot.url).pathname;
  const surface = classifySurface(pathname);
  const head = extractSeoHead(snapshot.html);
  const checks =
    snapshot.status === 200
      ? [
          ...auditTechnicalSeo(snapshot, head, context),
          ...auditAgentReadiness(head, surface),
          ...auditPageCopy(head, surface, pathname),
        ]
      : auditTechnicalSeo(snapshot, head, context);
  return {
    url: snapshot.url,
    pathname,
    surface,
    passed: checks.every(item => item.status !== 'failed'),
    checks,
  };
}

/**
 * One kernel receipt per dimension. Warnings pass: they rank work, they do not
 * block admission.
 */
export function toCertificationReceipts(
  page: SeoPageCertification,
  sourceSha: string | null,
  ref: string
): CertificationEvidenceReceipt[] {
  return SEO_CHECK_DIMENSIONS.flatMap(dimension => {
    const checks = page.checks.filter(item => item.dimension === dimension);
    if (checks.length === 0) return [];
    const failed = checks.filter(item => item.status === 'failed');
    return [
      {
        id: `seo.${dimension}`,
        tier: 'invariant_evaluation' as const,
        status: failed.length === 0 ? ('passed' as const) : ('failed' as const),
        sourceSha,
        ref: `${ref}#${page.pathname}`,
        digest: null,
        summary:
          failed.length === 0
            ? `${checks.length} ${dimension} checks passed`
            : failed.map(item => `${item.id}: ${item.summary}`).join('; '),
      },
    ];
  });
}
