import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Metadata, MetadataRoute } from 'next';

export type SeoRequiredField =
  | 'title'
  | 'description'
  | 'canonical'
  | 'openGraph'
  | 'twitter';

export interface SeoRouteBaselineEntry {
  readonly path: string;
  readonly sourceFile: string;
  readonly required: readonly SeoRequiredField[];
  readonly jsonLd: boolean;
}

export interface SeoProfileSurfaceBaselineEntry {
  readonly id: string;
  readonly sourceFile: string;
  readonly required?: readonly SeoRequiredField[];
  readonly jsonLd: boolean;
  readonly metadataBuilder?: string;
  readonly requireGenerateMetadata?: boolean;
}

export interface SeoRatchetBaseline {
  readonly schemaVersion: number;
  readonly routes: readonly SeoRouteBaselineEntry[];
  readonly profileSurfaces: readonly SeoProfileSurfaceBaselineEntry[];
  readonly robots: {
    readonly requiredAiCrawlers: readonly string[];
    readonly productionSitemapUrl: string;
    readonly forbiddenWildcardDisallow: string;
  };
  readonly sitemap: {
    readonly minEntries: number;
    readonly requireLastModified: boolean;
  };
}

export interface SeoValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly remediation?: string;
}

const RATCHET_DIR = dirname(fileURLToPath(import.meta.url));

export function loadSeoRatchetBaseline(): SeoRatchetBaseline {
  const raw = readFileSync(join(RATCHET_DIR, 'ratchet-baseline.json'), 'utf8');
  return JSON.parse(raw) as SeoRatchetBaseline;
}

export function resolveSeoSourcePath(sourceFile: string): string {
  return join(RATCHET_DIR, '..', '..', sourceFile);
}

function resolveTitle(metadata: Metadata | undefined): string | null {
  const title = metadata?.title;
  if (typeof title === 'string') return title.trim() || null;
  if (typeof title === 'object' && title !== null) {
    const objectTitle = title as { default?: string; absolute?: string };
    const value = objectTitle.absolute ?? objectTitle.default;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  return null;
}

function resolveCanonical(metadata: Metadata | undefined): string | null {
  const canonical = metadata?.alternates?.canonical;
  if (typeof canonical === 'string') return canonical.trim() || null;
  if (
    typeof canonical === 'object' &&
    canonical !== null &&
    'url' in canonical
  ) {
    const value = (canonical as { url?: string }).url;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  return null;
}

export function validateMetadataField(
  metadata: Metadata | undefined,
  field: SeoRequiredField,
  label: string
): SeoValidationIssue | null {
  switch (field) {
    case 'title': {
      const title = resolveTitle(metadata);
      if (!title) {
        return {
          code: 'missing-title',
          message: `${label}: metadata.title must be a non-empty string`,
          remediation:
            'Add or restore `export const metadata` / `generateMetadata` title for this route.',
        };
      }
      return null;
    }
    case 'description': {
      const description = metadata?.description;
      if (typeof description !== 'string' || !description.trim()) {
        return {
          code: 'missing-description',
          message: `${label}: metadata.description must be a non-empty string`,
          remediation:
            'Add a concise meta description in the route metadata export.',
        };
      }
      return null;
    }
    case 'canonical': {
      const canonical = resolveCanonical(metadata);
      if (!canonical) {
        return {
          code: 'missing-canonical',
          message: `${label}: metadata.alternates.canonical must be set`,
          remediation:
            'Set `alternates.canonical` to the route’s absolute or root-relative canonical URL.',
        };
      }
      return null;
    }
    case 'openGraph': {
      const og = metadata?.openGraph;
      if (!og?.title || !og.description) {
        return {
          code: 'missing-open-graph',
          message: `${label}: metadata.openGraph.title and description must be non-empty`,
          remediation:
            'Populate `openGraph.title` and `openGraph.description` in route metadata.',
        };
      }
      return null;
    }
    case 'twitter': {
      const tw = metadata?.twitter;
      const card =
        tw && typeof tw === 'object' && 'card' in tw
          ? (tw as { card?: string }).card
          : undefined;
      if (!card) {
        return {
          code: 'missing-twitter',
          message: `${label}: metadata.twitter.card must be set`,
          remediation:
            'Add `twitter.card` (usually `summary_large_image`) to route metadata.',
        };
      }
      return null;
    }
    default:
      return null;
  }
}

export function validateRouteMetadata(
  metadata: Metadata | undefined,
  required: readonly SeoRequiredField[],
  label: string
): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];

  if (!metadata) {
    issues.push({
      code: 'missing-metadata-export',
      message: `${label}: must export metadata`,
      remediation:
        'Export `metadata` or implement `generateMetadata` for this route.',
    });
    return issues;
  }

  const robotsMeta = metadata.robots;
  if (
    robotsMeta &&
    typeof robotsMeta === 'object' &&
    'index' in robotsMeta &&
    (robotsMeta as { index?: boolean }).index === false
  ) {
    issues.push({
      code: 'noindex-in-seo-baseline',
      message: `${label}: is in the SEO ratchet baseline but has robots.index=false`,
      remediation:
        'Remove the route from `ratchet-baseline.json` if noindex is intentional.',
    });
  }

  for (const field of required) {
    const issue = validateMetadataField(metadata, field, label);
    if (issue) issues.push(issue);
  }

  return issues;
}

export function validateSourceJsonLd(
  source: string,
  label: string
): SeoValidationIssue | null {
  if (
    !source.includes("type='application/ld+json'") &&
    !source.includes('type="application/ld+json"')
  ) {
    return {
      code: 'missing-json-ld',
      message: `${label}: source must render JSON-LD via application/ld+json`,
      remediation:
        'Add a `<script type="application/ld+json">` block or restore the schema builder import.',
    };
  }
  return null;
}

export function validateSourceMetadataPatterns(
  source: string,
  required: readonly SeoRequiredField[],
  label: string
): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];
  const patternChecks: Partial<Record<SeoRequiredField, RegExp>> = {
    canonical: /alternates:\s*\{[\s\S]*canonical(?::|,)/,
    openGraph: /openGraph:\s*\{/,
    twitter: /twitter:\s*\{/,
    title: /\btitle(?::|,)/,
    description: /\bdescription(?::|,)/,
  };

  for (const field of required) {
    const pattern = patternChecks[field];
    if (pattern && !pattern.test(source)) {
      issues.push({
        code: `missing-source-${field}`,
        message: `${label}: source file is missing ${field} metadata wiring`,
        remediation: `Restore the route’s ${field} metadata in its page/layout source.`,
      });
    }
  }

  return issues;
}

export function validateGenerateMetadataExport(
  source: string,
  label: string
): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];

  if (!/export\s+async\s+function\s+generateMetadata/.test(source)) {
    issues.push({
      code: 'missing-generate-metadata',
      message: `${label}: must export generateMetadata for dynamic SEO`,
      remediation:
        'Restore `export async function generateMetadata` on this route.',
    });
    return issues;
  }

  return [
    ...validateSourceMetadataPatterns(
      source,
      ['title', 'description', 'canonical', 'openGraph', 'twitter'],
      label
    ),
  ];
}

export function validateProductionRobots(
  robots: MetadataRoute.Robots,
  baseline = loadSeoRatchetBaseline()
): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
  const wildcard = rules.find(rule => rule.userAgent === '*');

  if (wildcard?.allow !== '/') {
    issues.push({
      code: 'robots-missing-allow-root',
      message: 'Production wildcard robots rule must include allow: "/"',
      remediation:
        'Ensure `robots.ts` serves allow-rules when VERCEL_ENV is production or unset.',
    });
  }

  const disallow = wildcard?.disallow;
  const disallowList = Array.isArray(disallow)
    ? disallow
    : disallow
      ? [disallow]
      : [];
  if (
    disallow === baseline.robots.forbiddenWildcardDisallow ||
    disallowList.includes(baseline.robots.forbiddenWildcardDisallow)
  ) {
    issues.push({
      code: 'robots-global-disallow',
      message:
        'Production wildcard robots rule must not contain bare Disallow: / (JOV-11043 regression)',
      remediation:
        'Check VERCEL_ENV fail-safe logic in `app/robots.ts`; missing env must not block all crawlers.',
    });
  }

  if (robots.sitemap !== baseline.robots.productionSitemapUrl) {
    issues.push({
      code: 'robots-missing-sitemap',
      message: `Production robots must reference ${baseline.robots.productionSitemapUrl}`,
      remediation:
        'Set `sitemap: `${BASE_URL}/sitemap.xml`` in production robots config.',
    });
  }

  const presentCrawlers = rules
    .map(rule => (typeof rule.userAgent === 'string' ? rule.userAgent : null))
    .filter((value): value is string => Boolean(value));

  for (const crawler of baseline.robots.requiredAiCrawlers) {
    if (!presentCrawlers.includes(crawler)) {
      issues.push({
        code: 'robots-missing-ai-crawler',
        message: `AI crawler "${crawler}" is missing from production robots rules`,
        remediation:
          'Add an explicit allow rule for this crawler in `app/robots.ts`.',
      });
      continue;
    }

    const rule = rules.find(entry => entry.userAgent === crawler);
    const allow = rule?.allow;
    const allowList = Array.isArray(allow) ? allow : allow ? [allow] : [];
    if (!allowList.includes('/')) {
      issues.push({
        code: 'robots-ai-crawler-not-allowed',
        message: `AI crawler "${crawler}" must have allow: "/"`,
        remediation:
          'Restore explicit `allow: "/"` for each AI crawler rule in `app/robots.ts`.',
      });
    }
  }

  return issues;
}

export function validateSitemapEntries(
  entries: MetadataRoute.Sitemap,
  baseline = loadSeoRatchetBaseline()
): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];

  if (entries.length < baseline.sitemap.minEntries) {
    issues.push({
      code: 'sitemap-empty',
      message: `Sitemap must contain at least ${baseline.sitemap.minEntries} URL entries`,
      remediation:
        'Ensure static marketing URLs are always present in `app/sitemap.ts`.',
    });
    return issues;
  }

  if (baseline.sitemap.requireLastModified) {
    const missingLastModified = entries.filter(entry => !entry.lastModified);
    if (missingLastModified.length > 0) {
      issues.push({
        code: 'sitemap-missing-lastmod',
        message: `${missingLastModified.length} sitemap entries are missing lastModified`,
        remediation:
          'Set `lastModified` on every sitemap entry in `app/sitemap.ts`.',
      });
    }
  }

  return issues;
}

export function parseRobotsTxt(text: string): {
  readonly wildcardDisallow: readonly string[];
  readonly sitemapUrls: readonly string[];
  readonly aiCrawlerAllows: Readonly<Record<string, boolean>>;
} {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  let currentAgents: string[] = [];
  const wildcardDisallow: string[] = [];
  const sitemapUrls: string[] = [];
  const aiCrawlerAllows: Record<string, boolean> = {};

  // Parse directives by splitting on the first colon rather than regex.
  // robots.txt is a simple `Directive: value` format; a linear split avoids
  // the super-linear backtracking risk of `\s*(.+)` style patterns (S5852).
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (directive === 'sitemap') {
      if (value) sitemapUrls.push(value);
      continue;
    }

    if (directive === 'user-agent') {
      if (value) currentAgents = [value];
      continue;
    }

    if (directive === 'disallow') {
      if (currentAgents.includes('*')) wildcardDisallow.push(value);
      continue;
    }

    if (directive === 'allow') {
      for (const agent of currentAgents) {
        if (value === '/') aiCrawlerAllows[agent] = true;
      }
    }
  }

  return { wildcardDisallow, sitemapUrls, aiCrawlerAllows };
}

export function validateLiveRobotsTxt(
  text: string,
  baseline = loadSeoRatchetBaseline()
): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];
  const parsed = parseRobotsTxt(text);

  if (
    parsed.wildcardDisallow.includes(baseline.robots.forbiddenWildcardDisallow)
  ) {
    issues.push({
      code: 'live-robots-global-disallow',
      message: 'Live robots.txt blocks all crawlers with Disallow: /',
      remediation:
        'Deploy a production-shaped build or fix VERCEL_ENV handling in `app/robots.ts`.',
    });
  }

  if (
    !parsed.sitemapUrls.some(url =>
      url.includes(baseline.robots.productionSitemapUrl)
    )
  ) {
    issues.push({
      code: 'live-robots-missing-sitemap',
      message: `Live robots.txt must reference ${baseline.robots.productionSitemapUrl}`,
      remediation: 'Restore the production sitemap line in robots output.',
    });
  }

  for (const crawler of baseline.robots.requiredAiCrawlers) {
    if (!parsed.aiCrawlerAllows[crawler]) {
      issues.push({
        code: 'live-robots-missing-ai-crawler',
        message: `Live robots.txt is missing Allow: / for ${crawler}`,
        remediation:
          'Restore explicit AI crawler allow rules in `app/robots.ts`.',
      });
    }
  }

  return issues;
}

export function validateLiveSitemapXml(
  xml: string,
  baseline = loadSeoRatchetBaseline()
): SeoValidationIssue[] {
  const issues: SeoValidationIssue[] = [];

  if (!xml.includes('<urlset') || !xml.includes('<url>')) {
    issues.push({
      code: 'live-sitemap-invalid-xml',
      message:
        'Live sitemap.xml is missing a valid <urlset> with <url> entries',
      remediation: 'Verify `app/sitemap.ts` renders and is deployed.',
    });
    return issues;
  }

  const urlBlocks = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map(
    match => match[0] ?? ''
  );
  if (urlBlocks.length < baseline.sitemap.minEntries) {
    issues.push({
      code: 'live-sitemap-empty',
      message: `Live sitemap.xml must contain at least ${baseline.sitemap.minEntries} URL entries`,
      remediation: 'Ensure sitemap generation is healthy in production.',
    });
    return issues;
  }

  if (baseline.sitemap.requireLastModified) {
    const missing = urlBlocks.filter(
      block => !/<lastmod>[\s\S]*?<\/lastmod>/i.test(block)
    );
    if (missing.length > 0) {
      issues.push({
        code: 'live-sitemap-missing-lastmod',
        message: `${missing.length} live sitemap URLs are missing <lastmod>`,
        remediation:
          'Set `lastModified` on every sitemap entry in `app/sitemap.ts`.',
      });
    }
  }

  return issues;
}
