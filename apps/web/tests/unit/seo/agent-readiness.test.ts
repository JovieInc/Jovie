/**
 * JOV-7259: failure-path coverage for the claude-seo deterministic subset —
 * llms.txt structure, robots.txt crawler purpose, JSON-LD property/parity
 * checks, markdown delivery, and cohort templated metadata.
 */
import { describe, expect, it } from 'vitest';
import {
  auditCohortMetadata,
  auditLlmsTxtStructure,
  auditRobotsTxt,
} from '@/lib/seo/agent-site-readiness';
import {
  auditAgentReadiness,
  auditJsonLdSemantics,
  extractSeoHead,
} from '@/lib/seo/page-certification';

const GOOD_LLMS = `# Jovie

> Jovie is one product for presence, relationships, and growth.

## Docs

- [Pricing](https://jov.ie/pricing) — plans and features
- [About](https://jov.ie/about) — company story
`;

const CRAWLER_RULES = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'Claude-SearchBot',
  'Claude-Web',
  'ClaudeBot',
  'Anthropic-AI',
  'Applebot-Extended',
  'PerplexityBot',
  'Google-Extended',
]
  .map(crawler => `User-agent: ${crawler}\nAllow: /\nDisallow: /app/\n`)
  .join('\n');

const GOOD_ROBOTS = `User-agent: *\nAllow: /\nDisallow: /app/\n\n${CRAWLER_RULES}Sitemap: https://jov.ie/sitemap.xml\n`;

const byId = (checks: readonly { id: string }[], id: string) =>
  checks.find(item => item.id === id);

describe('auditLlmsTxtStructure', () => {
  it('passes a well-formed llms.txt', () => {
    const checks = auditLlmsTxtStructure(GOOD_LLMS);
    expect(checks.every(check => check.status === 'passed')).toBe(true);
  });

  it('fails when the H1 is missing or not first', () => {
    for (const body of [
      'No heading here\n\n> summary\n\n## A\n\n- [x](https://jov.ie/x)',
      '## Section first\n\n# Jovie\n\n> s\n\n## A\n\n- [x](https://jov.ie/x)',
      '# One\n\n# Two\n\n> s\n\n## A\n\n- [x](https://jov.ie/x)',
    ]) {
      expect(byId(auditLlmsTxtStructure(body), 'llms-txt-h1')?.status).toBe(
        'failed'
      );
    }
  });

  it('fails when the blockquote summary is missing', () => {
    const body = '# Jovie\n\n## Docs\n\n- [x](https://jov.ie/x)';
    expect(byId(auditLlmsTxtStructure(body), 'llms-txt-summary')?.status).toBe(
      'failed'
    );
  });

  it('fails on zero Markdown links — the 2026-09-30 live regression', () => {
    const body =
      '# Jovie\n\n> summary\n\n## Pages\n\n- Pricing: https://jov.ie/pricing\n';
    const check = byId(auditLlmsTxtStructure(body), 'llms-txt-links');
    expect(check?.status).toBe('failed');
    expect(check?.summary).toContain('zero Markdown links');
  });

  it('fails when a Markdown link sits outside any H2 section', () => {
    const body = `# Jovie\n\n- [Loose](https://jov.ie/loose)\n\n> summary\n\n## Docs\n\n- [x](https://jov.ie/x)`;
    expect(byId(auditLlmsTxtStructure(body), 'llms-txt-links')?.status).toBe(
      'failed'
    );
  });
});

describe('auditRobotsTxt', () => {
  it('passes production robots with search + training tokens allowed', () => {
    const checks = auditRobotsTxt(GOOD_ROBOTS);
    expect(checks.every(check => check.status !== 'failed')).toBe(true);
    expect(byId(checks, 'robots-search-crawlers')?.summary).toContain(
      'OAI-SearchBot'
    );
    // Training grants are recorded as advisory, never as citability proof.
    expect(byId(checks, 'robots-training-tokens')?.status).toBe('warn');
  });

  it('fails when search crawlers are missing even though GPTBot is allowed', () => {
    const body = `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nSitemap: https://jov.ie/sitemap.xml\n`;
    const check = byId(auditRobotsTxt(body), 'robots-search-crawlers');
    expect(check?.status).toBe('failed');
    expect(check?.summary).toContain('OAI-SearchBot');
  });

  it('fails when a search crawler is globally blocked', () => {
    const body = GOOD_ROBOTS.replace(
      'User-agent: Claude-SearchBot\nAllow: /\nDisallow: /app/',
      'User-agent: Claude-SearchBot\nDisallow: /'
    );
    const check = byId(auditRobotsTxt(body), 'robots-search-crawlers');
    expect(check?.status).toBe('failed');
    expect(check?.summary).toContain('Claude-SearchBot');
  });

  it('fails on a global wildcard block', () => {
    expect(
      byId(
        auditRobotsTxt('User-agent: *\nDisallow: /\n'),
        'robots-global-block'
      )?.status
    ).toBe('failed');
  });
});

// ---------------------------------------------------------------------------

const PAGE_META = `<title>Pricing | Jovie</title>
<meta name="description" content="Jovie profiles are free forever. Artist Visibility Pro is $199/month with limited access."/>`;

function headWithLd(documents: unknown[]): ReturnType<typeof extractSeoHead> {
  const scripts = documents
    .map(
      doc =>
        `<script type="application/ld+json">${JSON.stringify(doc)}</script>`
    )
    .join('');
  return extractSeoHead(
    `<html lang="en"><head>${PAGE_META}${scripts}</head><body><h1>Pricing</h1><p>Jovie profiles are free forever.</p></body></html>`
  );
}

describe('auditJsonLdSemantics', () => {
  // The real /pricing shape: WebPage > ItemList > ListItem > Product > Offer.
  const PRICING_GRAPH = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Pricing | Jovie',
    description:
      'Jovie profiles are free forever. Artist Visibility Pro is $199/month with limited access.',
    url: 'https://jov.ie/pricing',
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          item: {
            '@type': 'Product',
            name: 'Jovie Free',
            description: 'Free forever profile.',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
              url: 'https://jov.ie/signup?plan=free',
            },
          },
        },
      ],
    },
  };

  it('passes the nested WebPage > ItemList > Product > Offer graph', () => {
    const checks = auditJsonLdSemantics(headWithLd([PRICING_GRAPH]));
    expect(checks.every(check => check.status === 'passed')).toBe(true);
  });

  it('fails on relative Offer.url (live /pricing evidence)', () => {
    const doc = JSON.parse(
      JSON.stringify(PRICING_GRAPH)
    ) as typeof PRICING_GRAPH;
    const offer = doc.mainEntity.itemListElement[0]!.item.offers;
    (offer as { url: string }).url = '/signup?plan=free';
    const check = byId(
      auditJsonLdSemantics(headWithLd([doc])),
      'jsonld-absolute-url'
    );
    expect(check?.status).toBe('failed');
    expect(check?.summary).toContain('offers.url');
  });

  it('fails on a JSON-LD document with no @type', () => {
    const check = byId(
      auditJsonLdSemantics(
        headWithLd([{ '@context': 'https://schema.org', name: 'Untyped' }])
      ),
      'jsonld-type'
    );
    expect(check?.status).toBe('failed');
  });

  it('fails on an @graph member with no @type', () => {
    const check = byId(
      auditJsonLdSemantics(
        headWithLd([
          {
            '@context': 'https://schema.org',
            '@graph': [{ name: 'Untyped member' }],
          },
        ])
      ),
      'jsonld-type'
    );
    expect(check?.status).toBe('failed');
  });

  it('warns on missing required properties', () => {
    const check = byId(
      auditJsonLdSemantics(
        headWithLd([{ '@type': 'Product', description: 'no name' }])
      ),
      'jsonld-required-props'
    );
    expect(check?.status).toBe('warn');
  });

  it('warns when the JSON-LD page entity drifts from rendered copy', () => {
    const doc = JSON.parse(
      JSON.stringify(PRICING_GRAPH)
    ) as typeof PRICING_GRAPH;
    doc.name = 'Totally unrelated entity name';
    const check = byId(
      auditJsonLdSemantics(headWithLd([doc])),
      'jsonld-rendered-parity'
    );
    expect(check?.status).toBe('warn');
  });

  it('emits nothing when the page has no JSON-LD (structured-data covers it)', () => {
    expect(auditJsonLdSemantics(headWithLd([]))).toEqual([]);
  });
});

describe('markdown-delivery (advisory)', () => {
  it('warns when no markdown alternate is advertised', () => {
    const head = extractSeoHead(
      `<html lang="en"><head>${PAGE_META}</head><body><h1>Pricing</h1></body></html>`
    );
    const check = byId(
      auditAgentReadiness(head, 'marketing'),
      'markdown-delivery'
    );
    expect(check?.status).toBe('warn');
  });

  it('passes when a text/markdown alternate link is present', () => {
    const head = extractSeoHead(
      `<html lang="en"><head>${PAGE_META}<link rel="alternate" type="text/markdown" href="https://jov.ie/pricing.md"/></head><body><h1>Pricing</h1></body></html>`
    );
    const check = byId(
      auditAgentReadiness(head, 'marketing'),
      'markdown-delivery'
    );
    expect(check?.status).toBe('passed');
  });
});

describe('auditCohortMetadata', () => {
  const page = (pathname: string, title: string, isRecordPage = false) => ({
    pathname,
    title,
    description: `desc-${pathname}`,
    inSitemap: true,
    isRecordPage,
  });

  it('flags identical titles across swept sitemap pages', () => {
    const findings = auditCohortMetadata([
      page('/a', 'Same title'),
      page('/b', 'Same title'),
      page('/c', 'Unique title'),
    ]);
    expect(findings.get('/a')?.id).toBe('templated-metadata');
    expect(findings.get('/b')?.id).toBe('templated-metadata');
    expect(findings.has('/c')).toBe(false);
  });

  it('fails factory record pages and only warns hand-authored pages', () => {
    const findings = auditCohortMetadata([
      page('/solutions/a', 'Templated', true),
      page('/solutions/b', 'Templated', true),
      page('/x', 'Templated'),
    ]);
    expect(findings.get('/solutions/a')?.status).toBe('failed');
    expect(findings.get('/x')?.status).toBe('warn');
  });

  it('ignores pages outside the sitemap', () => {
    const findings = auditCohortMetadata([
      { ...page('/a', 'Dup'), inSitemap: false },
      page('/b', 'Dup'),
    ]);
    expect(findings.size).toBe(0);
  });
});
