import { describe, expect, it } from 'vitest';
import {
  auditIsAgentic,
  certifyPage,
  classifySurface,
  extractSeoHead,
  extractVisibleText,
  parseIsAgenticReport,
  toCertificationReceipts,
} from '@/lib/seo/page-certification';

const BODY_WORDS = Array.from(
  { length: 60 },
  (_, index) => `word${index}`
).join(' ');

function page({
  head = '',
  body = `<main><h1>Release strategy</h1><p>${BODY_WORDS}</p></main>`,
}: {
  head?: string;
  body?: string;
} = {}): string {
  return `<!doctype html><html lang="en"><head>
<title>How to plan a release | Jovie</title>
<meta name="description" content="A release plan that gets your single heard: timeline, pitching, and the links that turn listeners into fans."/>
<link rel="canonical" href="https://jov.ie/blog/release-plan"/>
<meta property="og:title" content="How to plan a release"/>
<meta property="og:description" content="A release plan that works."/>
<meta property="og:image" content="https://jov.ie/og/default.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article"},{"@type":"BreadcrumbList"}]}</script>
${head}</head><body><header><nav>Pricing Blog</nav></header>${body}<footer>Legal</footer></body></html>`;
}

const INTEGRATIONS_URL = 'https://jov.ie/integrations';
const CONTEXT = { siteOrigin: 'https://jov.ie', inSitemap: true } as const;

function certify(
  html: string,
  status = 200,
  url = 'https://jov.ie/blog/release-plan'
) {
  return certifyPage({ url, status, html }, CONTEXT);
}

function statusOf(html: string, id: string, url?: string) {
  return certify(html, 200, url).checks.find(item => item.id === id)?.status;
}

describe('extractSeoHead', () => {
  it('reads head tags, JSON-LD types, and page-owned text', () => {
    const head = extractSeoHead(page());
    expect(head.title).toBe('How to plan a release | Jovie');
    expect(head.canonical).toBe('https://jov.ie/blog/release-plan');
    expect(head.ogImage).toBe('https://jov.ie/og/default.png');
    expect(head.jsonLdTypes).toEqual(['Article', 'BreadcrumbList']);
    expect(head.h1Count).toBe(1);
    expect(head.lang).toBe('en');
    expect(head.visibleText).not.toContain('Pricing');
    expect(head.visibleText).not.toContain('Legal');
  });

  it('counts streamed Suspense segments as server-rendered text', () => {
    const text = extractVisibleText(
      '<html><body><main>shell</main><div hidden id="S:0"><p>streamed article body</p></div><script>self.__next_f=[]</script></body></html>'
    );
    expect(text).toContain('streamed article body');
    expect(text).not.toContain('__next_f');
  });

  it('counts JSON-LD parse errors instead of throwing', () => {
    const head = extractSeoHead(
      '<html><head><script type="application/ld+json">{bad</script></head><body></body></html>'
    );
    expect(head.jsonLdErrors).toBe(1);
  });
});

describe('certifyPage', () => {
  it('passes a complete page and emits one kernel receipt per dimension', () => {
    const result = certify(page());
    expect(result.passed).toBe(true);
    const receipts = toCertificationReceipts(result, 'abc123', 'run:1');
    expect(receipts.map(receipt => receipt.id)).toEqual([
      'seo.technical',
      'seo.agentic',
      'seo.copy',
    ]);
    expect(
      receipts.every(receipt => receipt.tier === 'invariant_evaluation')
    ).toBe(true);
    expect(receipts.every(receipt => receipt.status === 'passed')).toBe(true);
    expect(receipts[0]?.ref).toBe('run:1#/blog/release-plan');
  });

  it('fails a sitemap URL that is noindex', () => {
    expect(
      statusOf(
        page({ head: '<meta name="robots" content="noindex, follow"/>' }),
        'indexability'
      )
    ).toBe('failed');
  });

  it('fails a sitemap URL whose canonical points elsewhere', () => {
    const html = page().replace(
      'https://jov.ie/blog/release-plan"/>',
      'https://jov.ie/blog"/>'
    );
    expect(statusOf(html, 'canonical')).toBe('failed');
  });

  it('fails a missing og:image but only warns on a missing twitter card', () => {
    expect(
      statusOf(
        page().replace(/<meta property="og:image"[^>]*>/, ''),
        'open-graph'
      )
    ).toBe('failed');
    expect(
      statusOf(
        page().replace(/<meta name="twitter:card"[^>]*>/, ''),
        'open-graph'
      )
    ).toBe('warn');
  });

  it('fails pages without structured data or with a JS-only shell', () => {
    const noJsonLd = page().replace(
      /<script type="application\/ld\+json">.*?<\/script>/,
      ''
    );
    expect(statusOf(noJsonLd, 'structured-data')).toBe('failed');
    expect(
      statusOf(
        page({ body: '<main><h1>Hi</h1></main>' }),
        'server-rendered-content'
      )
    ).toBe('failed');
  });

  it('holds link pages to the lower word floor', () => {
    const smartLink = page({
      body: '<main><h1>The Deep End</h1><p>Tim White listen on Spotify Apple Music YouTube Deezer Tidal</p></main>',
    });
    expect(
      statusOf(
        smartLink,
        'server-rendered-content',
        'https://jov.ie/tim/the-deep-end'
      )
    ).toBe('passed');
    expect(
      statusOf(smartLink, 'server-rendered-content', INTEGRATIONS_URL)
    ).toBe('failed');
  });

  it('fails copy with an em dash and never runs judges in the sweep', () => {
    const html = page({
      body: `<main><h1>Release</h1><p>${BODY_WORDS} Your fans — all of them.</p></main>`,
    });
    expect(
      certify(html, 200, INTEGRATIONS_URL).checks.find(
        item => item.id === 'copy-lint'
      )
    ).toMatchObject({
      status: 'failed',
      summary: expect.stringContaining('jovie-marketing'),
    });
    const result = certify(html, 200, 'https://jov.ie/');
    expect(result.checks.find(item => item.id === 'copy-lint')?.status).toBe(
      'failed'
    );
    expect(
      result.checks.find(item => item.id === 'copy-judge-flagship')?.status
    ).toBe('warn');
  });

  it('excludes legal pages from the copy gate', () => {
    const html = page({
      body: `<main><h1>Terms</h1><p>${BODY_WORDS} Fees — see below.</p></main>`,
    });
    expect(statusOf(html, 'copy-lint', 'https://jov.ie/legal/terms')).toBe(
      'passed'
    );
  });

  it('reports only the status check for a non-200 page', () => {
    const result = certify('', 404);
    expect(result.passed).toBe(false);
    expect(result.checks.map(item => item.id)).toEqual(['http-status']);
  });

  it('warns on out-of-range title length without failing', () => {
    const html = page().replace(
      '<title>How to plan a release | Jovie</title>',
      '<title>Pricing</title>'
    );
    expect(statusOf(html, 'title')).toBe('warn');
    expect(certify(html).passed).toBe(true);
  });
});

describe('classifySurface', () => {
  it.each([
    ['/', 'home'],
    ['/blog/x', 'blog'],
    ['/support', 'docs'],
    ['/legal/terms', 'legal'],
    ['/pricing', 'marketing'],
    ['/integrations', 'marketing'],
    ['/integrations-fan', 'profile'],
    ['/changelog/26.9.0', 'marketing'],
    ['/tim', 'profile'],
    ['/tim/the-deep-end', 'smart_link'],
  ])('%s -> %s', (path, surface) => {
    expect(classifySurface(path)).toBe(surface);
  });
});

describe('auditIsAgentic', () => {
  const report = {
    target: 'https://jov.ie',
    score: 100,
    issues: [
      {
        id: 'cli-tool',
        name: 'CLI tool available',
        result: 'partial',
        tier: 'recommended',
      },
    ],
  };

  it('passes at 100 and lists partial checks as warnings', () => {
    const checks = auditIsAgentic(parseIsAgenticReport(report));
    expect(checks.find(item => item.id === 'is-agentic-score')?.status).toBe(
      'passed'
    );
    expect(checks.find(item => item.id === 'is-agentic:cli-tool')?.status).toBe(
      'warn'
    );
  });

  it('fails below 100, on essential failed results, and closed on a missing report', () => {
    const low = auditIsAgentic(
      parseIsAgenticReport({
        ...report,
        score: 99,
        issues: [{ id: 'agent-404s', result: 'failed', tier: 'essential' }],
      })
    );
    expect(
      low.filter(item => item.status === 'failed').map(item => item.id)
    ).toEqual(['is-agentic-score', 'is-agentic-essential']);
    expect(
      auditIsAgentic(parseIsAgenticReport({ error: 'x' }))[0]?.status
    ).toBe('failed');
  });
});
