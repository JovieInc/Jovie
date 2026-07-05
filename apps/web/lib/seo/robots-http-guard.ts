/**
 * HTTP-level robots.txt + sitemap.xml guardrails (#11044).
 *
 * Used by post-deploy / preview smoke scripts to catch production-shaped
 * robots.txt that silently blocks all crawlers (incident #11043).
 */

const REQUIRED_AI_CRAWLERS = [
  'GPTBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
] as const;

export interface RobotsHttpGuardResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
}

export interface SitemapHttpGuardResult {
  readonly ok: boolean;
  readonly violations: readonly string[];
  readonly urlCount: number;
}

interface ParsedRobotsGroup {
  readonly userAgents: readonly string[];
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
}

function parseRobotsGroups(body: string): ParsedRobotsGroup[] {
  const groups: ParsedRobotsGroup[] = [];
  let current: {
    userAgents: string[];
    allow: string[];
    disallow: string[];
  } | null = null;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (directive === 'user-agent') {
      if (current) groups.push(current);
      current = { userAgents: [value], allow: [], disallow: [] };
      continue;
    }

    if (!current) continue;

    if (directive === 'allow') current.allow.push(value);
    if (directive === 'disallow') current.disallow.push(value);
  }

  if (current) groups.push(current);
  return groups;
}

/**
 * Detect a `Sitemap:` directive without a backtracking regex.
 *
 * Scans line-by-line (same idiom as parseRobotsGroups) so the check stays
 * linear in the body length and cannot be abused for ReDoS.
 */
function hasSitemapDirective(body: string): boolean {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    if (directive !== 'sitemap') continue;

    const value = line.slice(colonIndex + 1).trim();
    if (value.length > 0) return true;
  }

  return false;
}

function isGlobalBlock(group: ParsedRobotsGroup): boolean {
  if (!group.userAgents.includes('*')) return false;
  if (!group.disallow.includes('/')) return false;
  return !group.allow.includes('/');
}

function groupAllowsRootForAgent(
  groups: readonly ParsedRobotsGroup[],
  agent: string
): boolean {
  const group = groups.find(g => g.userAgents.includes(agent));
  if (!group) return false;
  return group.allow.includes('/');
}

/**
 * Validate a fetched robots.txt body for production SEO/AEO health.
 */
export function validateRobotsTxtBody(body: string): RobotsHttpGuardResult {
  const violations: string[] = [];
  const groups = parseRobotsGroups(body);

  if (groups.some(isGlobalBlock)) {
    violations.push(
      'robots.txt contains a global Disallow: / for User-agent: * — site is de-indexed'
    );
  }

  if (!hasSitemapDirective(body)) {
    violations.push(
      'robots.txt is missing a Sitemap: directive — crawlers cannot discover sitemap.xml'
    );
  }

  const wildcard = groups.find(g => g.userAgents.includes('*'));
  if (!wildcard?.allow.includes('/')) {
    violations.push('robots.txt must Allow: / for User-agent: * in production');
  }

  for (const crawler of REQUIRED_AI_CRAWLERS) {
    if (!groupAllowsRootForAgent(groups, crawler)) {
      violations.push(
        `robots.txt must Allow: / for ${crawler} (AEO crawler welcome rule)`
      );
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Validate a fetched sitemap.xml body.
 */
export function validateSitemapXmlBody(body: string): SitemapHttpGuardResult {
  const violations: string[] = [];

  if (!body.includes('<urlset') && !body.includes('<sitemapindex')) {
    violations.push(
      'sitemap.xml is not valid XML (missing urlset/sitemapindex)'
    );
  }

  const urlBlocks = body.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  if (urlBlocks.length === 0) {
    violations.push('sitemap.xml is empty — no <url> entries found');
  }

  for (const [index, block] of urlBlocks.entries()) {
    if (!/<loc>[^<]+<\/loc>/.test(block)) {
      violations.push(`sitemap.xml url[${index}] is missing <loc>`);
    }
    if (!/<lastmod>[^<]+<\/lastmod>/.test(block)) {
      violations.push(`sitemap.xml url[${index}] is missing <lastmod>`);
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    urlCount: urlBlocks.length,
  };
}

/**
 * Fetch and validate robots.txt + sitemap.xml from a live origin.
 */
export async function validateLiveSeoEndpoints(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<{
  readonly robots: RobotsHttpGuardResult;
  readonly sitemap: SitemapHttpGuardResult;
}> {
  const origin = new URL(baseUrl).origin;

  const robotsResponse = await fetchImpl(`${origin}/robots.txt`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!robotsResponse.ok) {
    return {
      robots: {
        ok: false,
        violations: [`robots.txt returned HTTP ${robotsResponse.status}`],
      },
      sitemap: {
        ok: false,
        violations: ['skipped — robots fetch failed'],
        urlCount: 0,
      },
    };
  }

  const robotsBody = await robotsResponse.text();
  const robots = validateRobotsTxtBody(robotsBody);

  const sitemapResponse = await fetchImpl(`${origin}/sitemap.xml`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!sitemapResponse.ok) {
    return {
      robots,
      sitemap: {
        ok: false,
        violations: [`sitemap.xml returned HTTP ${sitemapResponse.status}`],
        urlCount: 0,
      },
    };
  }

  const sitemapBody = await sitemapResponse.text();
  const sitemap = validateSitemapXmlBody(sitemapBody);

  return { robots, sitemap };
}
