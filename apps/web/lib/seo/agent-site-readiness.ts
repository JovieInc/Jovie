/**
 * Site-level and cohort-level agent-readiness checks for `seo:certify`
 * (JOV-7259): a narrow deterministic subset of the claude-seo rubric that the
 * per-page certifier cannot express.
 *
 * - `/llms.txt` structure: H1, blockquote summary, and Markdown links grouped
 *   under H2 headings (the llmstxt.org shape Lighthouse-compatible crawlers
 *   check; the 2026-09-30 live file had zero Markdown links).
 * - `robots.txt` crawler purpose: AI *search* crawlers (OAI-SearchBot,
 *   Claude-SearchBot, …) are citability evidence; training/control tokens
 *   (GPTBot, Google-Extended, …) are a separate, explicitly declared policy.
 * - Cohort metadata: factory-scaled pages must not share templated titles or
 *   descriptions.
 *
 * All checks report in the `SeoCheck` shape under the `agentic` dimension so
 * they flow through the same receipts and shrink-only baseline.
 */
import {
  AI_SEARCH_CRAWLERS,
  AI_TRAINING_TOKENS,
  parseRobotsRules,
} from '@/lib/seo/guardrail-check';
import type {
  ExtractedSeoHead,
  SeoCheck,
  SeoCheckStatus,
} from '@/lib/seo/page-certification';

function agentic(
  id: string,
  status: SeoCheckStatus,
  summary: string,
  remediation?: string
): SeoCheck {
  return remediation
    ? { dimension: 'agentic', id, status, summary, remediation }
    : { dimension: 'agentic', id, status, summary };
}

// ---------------------------------------------------------------------------
// /llms.txt structure
// ---------------------------------------------------------------------------

const MARKDOWN_LINK = /\[[^\]]+\]\([^()\s]+\)/g;
const H1 = /^#(?!#)\s+\S/;
const H2 = /^##(?!#)\s+\S/;

export function auditLlmsTxtStructure(content: string): SeoCheck[] {
  const lines = content.split(/\r?\n/);
  const checks: SeoCheck[] = [];

  const firstContentLine = lines.find(line => line.trim().length > 0);
  const h1Count = lines.filter(line => H1.test(line)).length;
  checks.push(
    firstContentLine !== undefined && H1.test(firstContentLine) && h1Count === 1
      ? agentic('llms-txt-h1', 'passed', 'single leading H1')
      : agentic(
          'llms-txt-h1',
          'failed',
          `llms.txt needs exactly one leading H1 (found ${h1Count}, first line ${JSON.stringify(firstContentLine ?? '')})`,
          'Start apps/web/app/llms.txt/route.ts output with `# Jovie` as the first line.'
        )
  );

  const h1Index = lines.findIndex(line => H1.test(line));
  const firstH2Index = lines.findIndex(line => H2.test(line));
  const summaryBlock = lines.slice(
    h1Index === -1 ? 0 : h1Index + 1,
    firstH2Index === -1 ? undefined : firstH2Index
  );
  const hasSummary = summaryBlock.some(line => /^>\s*\S/.test(line));
  checks.push(
    hasSummary
      ? agentic('llms-txt-summary', 'passed', 'blockquote summary present')
      : agentic(
          'llms-txt-summary',
          'failed',
          'llms.txt has no `> ` blockquote summary after the H1',
          'Add a `>` blockquote describing the site between the H1 and the first `##` section.'
        )
  );

  // Links must be real Markdown links grouped under H2 sections — bare URLs
  // and link-looking list items outside a section do not count.
  let inSection = false;
  let linksInSections = 0;
  const strayLinks: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (H2.test(line)) {
      inSection = true;
      continue;
    }
    const matches = line.match(MARKDOWN_LINK);
    if (!matches) continue;
    if (inSection) linksInSections += matches.length;
    else strayLinks.push(index + 1);
  }
  if (linksInSections === 0) {
    checks.push(
      agentic(
        'llms-txt-links',
        'failed',
        'llms.txt contains zero Markdown links under H2 sections',
        'Render resource entries as `- [Label](https://jov.ie/…) — description` under `##` headings.'
      )
    );
  } else if (strayLinks.length > 0) {
    checks.push(
      agentic(
        'llms-txt-links',
        'failed',
        `${linksInSections} Markdown link(s) under H2 sections, but link(s) on line(s) ${strayLinks.slice(0, 5).join(', ')} sit outside any section`,
        'Group every Markdown link under a `##` heading.'
      )
    );
  } else {
    checks.push(
      agentic(
        'llms-txt-links',
        'passed',
        `${linksInSections} Markdown link(s) grouped under H2 sections`
      )
    );
  }
  return checks;
}

// ---------------------------------------------------------------------------
// robots.txt crawler purpose
// ---------------------------------------------------------------------------

function ruleGloballyBlocks(
  rule: { allow: readonly string[]; disallow: readonly string[] } | undefined
): boolean {
  return Boolean(
    rule && rule.disallow.includes('/') && !rule.allow.includes('/')
  );
}

export function auditRobotsTxt(content: string): SeoCheck[] {
  const checks: SeoCheck[] = [];
  const rules = parseRobotsRules(content);

  const wildcard = rules.find(rule => rule.userAgents.includes('*'));
  checks.push(
    wildcard && !ruleGloballyBlocks(wildcard)
      ? agentic('robots-global-block', 'passed', 'wildcard agent allowed')
      : agentic(
          'robots-global-block',
          'failed',
          wildcard
            ? 'User-agent: * globally disallowed'
            : 'no User-agent: * rule in robots.txt',
          'Restore production allow-rules in apps/web/app/robots.ts.'
        )
  );

  const missingSearch: string[] = [];
  const blockedSearch: string[] = [];
  const allowedSearch: string[] = [];
  for (const crawler of AI_SEARCH_CRAWLERS) {
    const rule = rules.find(entry => entry.userAgents.includes(crawler));
    if (!rule) {
      missingSearch.push(crawler);
      continue;
    }
    if (ruleGloballyBlocks(rule)) {
      blockedSearch.push(crawler);
      continue;
    }
    allowedSearch.push(crawler);
  }
  checks.push(
    missingSearch.length === 0 && blockedSearch.length === 0
      ? agentic(
          'robots-search-crawlers',
          'passed',
          `AI search crawlers allowed: ${allowedSearch.join(', ')}`
        )
      : agentic(
          'robots-search-crawlers',
          'failed',
          [
            missingSearch.length > 0
              ? `missing rules: ${missingSearch.join(', ')}`
              : '',
            blockedSearch.length > 0
              ? `globally blocked: ${blockedSearch.join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('; '),
          'AI search crawlers need an explicit allow rule; training-token access (GPTBot, Google-Extended) is a separate policy and does not confer search citability.'
        )
  );

  // Advisory: name which training/control tokens the policy grants. Allowing
  // them is deliberate — this only records that the grant is not citability.
  const namedTraining = AI_TRAINING_TOKENS.filter(token =>
    rules.some(
      rule => rule.userAgents.includes(token) && !ruleGloballyBlocks(rule)
    )
  );
  checks.push(
    agentic(
      'robots-training-tokens',
      'warn',
      `training/control tokens with explicit allow rules: ${namedTraining.length > 0 ? namedTraining.join(', ') : 'none'} — a policy grant, not search citability`,
      'Keep AI_CRAWLERS in apps/web/app/robots.ts split by purpose (AI_SEARCH_CRAWLERS vs AI_TRAINING_TOKENS in lib/seo/guardrail-check.ts).'
    )
  );

  return checks;
}

// ---------------------------------------------------------------------------
// Cohort: duplicate / templated metadata across the swept pages
// ---------------------------------------------------------------------------

export interface CohortPageMeta {
  readonly pathname: string;
  readonly title: string | null;
  readonly description: string | null;
  /** Whether the sweep holds this page to indexing (sitemap member). */
  readonly inSitemap: boolean;
  /** Factory record pages must differ from each other, not just from hand-written pages. */
  readonly isRecordPage: boolean;
}

function normalizeMeta(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Pages sharing an identical normalized title or description read as one
 * templated page to crawlers. Record pages fail; the rest warn so existing
 * hand-authored debt ranks without gating.
 */
export function auditCohortMetadata(
  pages: readonly CohortPageMeta[]
): Map<string, SeoCheck> {
  const findings = new Map<string, SeoCheck>();
  const byField = new Map<string, Map<string, string[]>>();
  for (const field of ['title', 'description'] as const) {
    const groups = new Map<string, string[]>();
    for (const page of pages) {
      if (!page.inSitemap) continue;
      const value = page[field];
      if (!value) continue;
      const key = normalizeMeta(value);
      groups.set(key, [...(groups.get(key) ?? []), page.pathname]);
    }
    byField.set(field, groups);
  }
  for (const page of pages) {
    if (!page.inSitemap) continue;
    const shared: string[] = [];
    for (const field of ['title', 'description'] as const) {
      const value = page[field];
      if (!value) continue;
      const group = byField.get(field)?.get(normalizeMeta(value)) ?? [];
      if (group.length > 1) {
        shared.push(
          `${field} shared with ${group
            .filter(path => path !== page.pathname)
            .slice(0, 4)
            .join(', ')}`
        );
      }
    }
    if (shared.length === 0) continue;
    findings.set(
      page.pathname,
      agentic(
        'templated-metadata',
        page.isRecordPage ? 'failed' : 'warn',
        shared.join('; '),
        'Give each page a distinct title and description; factory-generated pages must not ship templated metadata.'
      )
    );
  }
  return findings;
}

/** Convenience view used by the sweep: heads for rendered pages. */
export function cohortPageMeta(
  pathname: string,
  head: ExtractedSeoHead,
  inSitemap: boolean,
  isRecordPage: boolean
): CohortPageMeta {
  return {
    pathname,
    title: head.title,
    description: head.description,
    inSitemap,
    isRecordPage,
  };
}
