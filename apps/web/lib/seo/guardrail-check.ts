/**
 * SEO/AEO live guardrail validators (JovieInc/Jovie#11044).
 *
 * Used by post-deploy canary checks and `scripts/seo-guardrail-check.ts`.
 * Unit-tested so robots/sitemap regressions cannot slip past deploy gates.
 */

export const REQUIRED_AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
] as const;

export interface SeoGuardrailFinding {
  readonly code: string;
  readonly message: string;
  readonly remediation: string;
}

export interface SeoGuardrailResult {
  readonly ok: boolean;
  readonly errors: readonly SeoGuardrailFinding[];
}

const GLOBAL_DISALLOW_REMEDIATION =
  'Restore production allow-rules in apps/web/app/robots.ts. VERCEL_ENV must fail-safe to allow indexing when unset — never emit a bare Disallow: / for User-agent: * in production-shaped deploys.';

const SITEMAP_REFERENCE_REMEDIATION =
  'Add sitemap: `${BASE_URL}/sitemap.xml` to the production robots() return in apps/web/app/robots.ts.';

const AI_CRAWLER_REMEDIATION =
  'Keep REQUIRED_AI_CRAWLERS in apps/web/app/robots.ts and mirror the list in tests/app/robots.test.ts.';

const SITEMAP_XML_REMEDIATION =
  'Ensure apps/web/app/sitemap.ts returns non-empty MetadataRoute.Sitemap entries with lastModified on every URL.';

function failure(
  code: string,
  message: string,
  remediation: string
): SeoGuardrailFinding {
  return { code, message, remediation };
}

function result(errors: SeoGuardrailFinding[]): SeoGuardrailResult {
  return { ok: errors.length === 0, errors };
}

interface ParsedRobotsRule {
  readonly userAgents: readonly string[];
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
}

function parseRobotsRules(content: string): ParsedRobotsRule[] {
  const rules: ParsedRobotsRule[] = [];
  let currentAgents: string[] = [];
  let currentAllow: string[] = [];
  let currentDisallow: string[] = [];

  const flush = () => {
    if (currentAgents.length === 0) return;
    rules.push({
      userAgents: currentAgents,
      allow: currentAllow,
      disallow: currentDisallow,
    });
    currentAgents = [];
    currentAllow = [];
    currentDisallow = [];
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const directive = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (directive === 'user-agent') {
      flush();
      currentAgents = [value];
      continue;
    }

    if (directive === 'allow') {
      currentAllow.push(value);
      continue;
    }

    if (directive === 'disallow') {
      currentDisallow.push(value);
    }
  }

  flush();
  return rules;
}

/**
 * Validate a production-shaped robots.txt body.
 * Preview/staging block-all robots files should not be passed here.
 */
export function validateRobotsTxt(content: string): SeoGuardrailResult {
  const errors: SeoGuardrailFinding[] = [];
  const rules = parseRobotsRules(content);

  const wildcardRule = rules.find(rule => rule.userAgents.includes('*'));
  if (!wildcardRule) {
    errors.push(
      failure(
        'robots.missing-wildcard',
        'robots.txt is missing a User-agent: * rule.',
        GLOBAL_DISALLOW_REMEDIATION
      )
    );
  } else {
    const globallyBlocked =
      wildcardRule.disallow.includes('/') && !wildcardRule.allow.includes('/');
    if (globallyBlocked) {
      errors.push(
        failure(
          'robots.global-disallow',
          'robots.txt blocks all crawlers with Disallow: / for User-agent: *.',
          GLOBAL_DISALLOW_REMEDIATION
        )
      );
    }
  }

  const hasSitemap = /^sitemap:\s*.+\/sitemap\.xml\s*$/im.test(content);
  if (!hasSitemap) {
    errors.push(
      failure(
        'robots.missing-sitemap',
        'robots.txt does not reference /sitemap.xml.',
        SITEMAP_REFERENCE_REMEDIATION
      )
    );
  }

  for (const crawler of REQUIRED_AI_CRAWLERS) {
    const crawlerRule = rules.find(rule => rule.userAgents.includes(crawler));
    if (!crawlerRule) {
      errors.push(
        failure(
          'robots.missing-ai-crawler',
          `robots.txt is missing an explicit rule for ${crawler}.`,
          AI_CRAWLER_REMEDIATION
        )
      );
      continue;
    }

    if (
      crawlerRule.disallow.includes('/') &&
      !crawlerRule.allow.includes('/')
    ) {
      errors.push(
        failure(
          'robots.ai-crawler-blocked',
          `robots.txt globally blocks ${crawler} with Disallow: /.`,
          AI_CRAWLER_REMEDIATION
        )
      );
    }
  }

  return result(errors);
}

/**
 * Validate a sitemap.xml body: well-formed urlset, non-empty, lastmod on every URL.
 */
export function validateSitemapXml(content: string): SeoGuardrailResult {
  const errors: SeoGuardrailFinding[] = [];
  const trimmed = content.trim();

  if (!trimmed) {
    errors.push(
      failure(
        'sitemap.empty',
        'sitemap.xml response body is empty.',
        SITEMAP_XML_REMEDIATION
      )
    );
    return result(errors);
  }

  if (!/<urlset[\s>]/i.test(trimmed)) {
    errors.push(
      failure(
        'sitemap.invalid-root',
        'sitemap.xml is missing a <urlset> root element.',
        SITEMAP_XML_REMEDIATION
      )
    );
    return result(errors);
  }

  const urlBlocks = [...trimmed.matchAll(/<url\b[^>]*>[\s\S]*?<\/url>/gi)];
  if (urlBlocks.length === 0) {
    errors.push(
      failure(
        'sitemap.no-urls',
        'sitemap.xml contains zero <url> entries.',
        SITEMAP_XML_REMEDIATION
      )
    );
    return result(errors);
  }

  for (const [index, match] of urlBlocks.entries()) {
    const block = match[0];
    if (!/<loc>[^<]+<\/loc>/i.test(block)) {
      errors.push(
        failure(
          'sitemap.missing-loc',
          `sitemap.xml entry ${index + 1} is missing <loc>.`,
          SITEMAP_XML_REMEDIATION
        )
      );
    }
    if (!/<lastmod>[^<]+<\/lastmod>/i.test(block)) {
      errors.push(
        failure(
          'sitemap.missing-lastmod',
          `sitemap.xml entry ${index + 1} is missing <lastmod>.`,
          SITEMAP_XML_REMEDIATION
        )
      );
    }
  }

  return result(errors);
}

export interface FetchSeoGuardrailsOptions {
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/**
 * Fetch robots.txt and sitemap.xml from a deployment base URL and validate both.
 */
export async function fetchAndValidateSeoGuardrails(
  baseUrl: string,
  options: FetchSeoGuardrailsOptions = {}
): Promise<{
  readonly robots: SeoGuardrailResult;
  readonly sitemap: SeoGuardrailResult;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const normalizedBase = baseUrl.replace(/\/$/, '');

  const [robotsResponse, sitemapResponse] = await Promise.all([
    fetchImpl(`${normalizedBase}/robots.txt`, {
      signal: options.signal,
      headers: { Accept: 'text/plain' },
    }),
    fetchImpl(`${normalizedBase}/sitemap.xml`, {
      signal: options.signal,
      headers: { Accept: 'application/xml,text/xml' },
    }),
  ]);

  if (!robotsResponse.ok) {
    return {
      robots: result([
        failure(
          'robots.http-error',
          `robots.txt returned HTTP ${robotsResponse.status}.`,
          GLOBAL_DISALLOW_REMEDIATION
        ),
      ]),
      sitemap: result([
        failure(
          'sitemap.http-error',
          `sitemap.xml returned HTTP ${sitemapResponse.status}.`,
          SITEMAP_XML_REMEDIATION
        ),
      ]),
    };
  }

  const robotsBody = await robotsResponse.text();
  const sitemapBody = sitemapResponse.ok ? await sitemapResponse.text() : '';

  const sitemapResult = sitemapResponse.ok
    ? validateSitemapXml(sitemapBody)
    : result([
        failure(
          'sitemap.http-error',
          `sitemap.xml returned HTTP ${sitemapResponse.status}.`,
          SITEMAP_XML_REMEDIATION
        ),
      ]);

  return {
    robots: validateRobotsTxt(robotsBody),
    sitemap: sitemapResult,
  };
}
