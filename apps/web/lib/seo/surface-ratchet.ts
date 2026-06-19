export interface SeoRobotsBaseline {
  readonly requiredAiCrawlers: readonly string[];
}

export interface SeoSitemapBaseline {
  readonly requireLastModified: boolean;
  readonly minEntryCount: number;
}

export interface SeoSurfaceViolation {
  readonly check: string;
  readonly message: string;
  readonly remediation: string;
}

function isGlobalDisallow(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  return normalized === '/' || normalized === '/*';
}

function parseRobotsRules(
  body: string
): Map<string, { allow: string[]; disallow: string[] }> {
  const rules = new Map<string, { allow: string[]; disallow: string[] }>();
  let currentAgent = '*';

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const [directive, ...rest] = line.split(':');
    if (!directive || rest.length === 0) continue;

    const value = rest.join(':').trim();
    const key = directive.trim().toLowerCase();

    if (key === 'user-agent') {
      currentAgent = value;
      if (!rules.has(currentAgent)) {
        rules.set(currentAgent, { allow: [], disallow: [] });
      }
      continue;
    }

    if (!rules.has(currentAgent)) {
      rules.set(currentAgent, { allow: [], disallow: [] });
    }

    const rule = rules.get(currentAgent);
    if (!rule) continue;

    if (key === 'allow') {
      rule.allow.push(value);
    }
    if (key === 'disallow') {
      rule.disallow.push(value);
    }
  }

  return rules;
}

export function validateRobotsTxtSurface(
  body: string,
  baseline: SeoRobotsBaseline
): SeoSurfaceViolation[] {
  const violations: SeoSurfaceViolation[] = [];
  const rules = parseRobotsRules(body);
  const wildcard = rules.get('*');

  if (!wildcard) {
    violations.push({
      check: 'robots-wildcard',
      message: 'robots.txt is missing a User-agent: * rule block.',
      remediation:
        'Restore the default crawler rule with Allow: / and scoped disallow paths.',
    });
  } else {
    const hasGlobalBlock = wildcard.disallow.some(isGlobalDisallow);
    if (hasGlobalBlock) {
      violations.push({
        check: 'robots-global-disallow',
        message:
          'robots.txt globally blocks all crawlers (User-agent: * + Disallow: /).',
        remediation:
          'Fix VERCEL_ENV fail-safe logic in app/robots.ts — undefined must not map to preview-block.',
      });
    }

    const allowsRoot =
      wildcard.allow.includes('/') || wildcard.allow.includes('/*');
    if (!allowsRoot) {
      violations.push({
        check: 'robots-allow-root',
        message: 'robots.txt does not allow crawling the site root.',
        remediation: 'Add Allow: / to the User-agent: * production rule block.',
      });
    }
  }

  if (!/sitemap:\s*https?:\/\//i.test(body)) {
    violations.push({
      check: 'robots-sitemap-reference',
      message: 'robots.txt does not reference an absolute sitemap URL.',
      remediation:
        'Add Sitemap: `${BASE_URL}/sitemap.xml` to the production robots config.',
    });
  }

  for (const crawler of baseline.requiredAiCrawlers) {
    if (!rules.has(crawler)) {
      violations.push({
        check: `robots-ai-crawler-${crawler}`,
        message: `robots.txt is missing explicit rules for ${crawler}.`,
        remediation: `Add ${crawler} to AI_CRAWLERS in app/robots.ts or update seo-ratchet.baseline.json intentionally.`,
      });
    }
  }

  return violations;
}

export function validateSitemapXmlSurface(
  xml: string,
  baseline: SeoSitemapBaseline
): SeoSurfaceViolation[] {
  const violations: SeoSurfaceViolation[] = [];
  const trimmed = xml.trim();

  if (!trimmed.startsWith('<?xml') && !trimmed.includes('<urlset')) {
    violations.push({
      check: 'sitemap-xml-shape',
      message:
        'sitemap.xml is not valid XML (missing declaration or <urlset>).',
      remediation:
        'Ensure app/sitemap.ts returns MetadataRoute.Sitemap entries and Next.js emits XML.',
    });
    return violations;
  }

  const locMatches = trimmed.match(/<loc>[^<]+<\/loc>/gi) ?? [];
  if (locMatches.length < baseline.minEntryCount) {
    violations.push({
      check: 'sitemap-non-empty',
      message: `sitemap.xml has ${locMatches.length} URLs; expected at least ${baseline.minEntryCount}.`,
      remediation:
        'Restore marketing/profile URLs in app/sitemap.ts or fix the production data source.',
    });
  }

  if (baseline.requireLastModified) {
    const urlBlocks = trimmed.match(/<url>[\s\S]*?<\/url>/gi) ?? [];
    const blocks = urlBlocks.length > 0 ? urlBlocks : [trimmed];
    const missingLastmod = blocks.filter(
      block => !/<lastmod>[^<]+<\/lastmod>/i.test(block)
    );

    if (missingLastmod.length > 0) {
      violations.push({
        check: 'sitemap-lastmod',
        message: `sitemap.xml is missing <lastmod> on ${missingLastmod.length} URL block(s).`,
        remediation:
          'Set lastModified on every sitemap entry in app/sitemap.ts.',
      });
    }
  }

  return violations;
}

export function formatSurfaceViolations(
  violations: readonly SeoSurfaceViolation[]
): string {
  return violations
    .map(
      violation =>
        `  ✗ [${violation.check}] ${violation.message}\n    Fix: ${violation.remediation}`
    )
    .join('\n');
}
