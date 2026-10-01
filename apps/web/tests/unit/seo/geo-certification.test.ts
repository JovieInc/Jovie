import { describe, expect, it } from 'vitest';
import {
  auditCanonicalPresent,
  auditDirectAnswer,
  auditGeo,
  auditJsonLdForFamily,
  auditLastUpdated,
  auditOrphans,
  auditSiblingLinks,
  GEO_FAMILY_RULES,
  geoFamilyFor,
  hasRevisionDateText,
  hasVisibleRevisionDate,
  inlineStreamedSegments,
  internalLinkPaths,
  paragraphsWithOffsets,
  trimTrailing,
} from '@/lib/seo/geo-certification';
import { extractSeoHead } from '@/lib/seo/page-certification';

const ORIGIN = 'https://jov.ie';
const ANSWER =
  'Jovie gives every artist one living profile that answers fans, press and agents.';

function page(body: string, head = ''): string {
  return `<!doctype html><html lang="en"><head><title>Jovie</title>${head}</head><body><header><nav><a href="/pricing">Pricing</a><a href="/about">About</a></nav></header><main>${body}</main><footer><a href="/blog">Blog</a></footer></body></html>`;
}

const SIBLINGS = new Set(['/pricing', '/about', '/blog', '/product', '/card']);
const context = (family = 'product' as const) => ({
  pathname: '/smart-links',
  family,
  siteOrigin: ORIGIN,
  isSiblingPath: (path: string) =>
    SIBLINGS.has(path) || path.startsWith('/compare/'),
});

describe('direct answer', () => {
  it('passes a complete paragraph that starts inside the first 100 words', () => {
    const check = auditDirectAnswer(
      page(`<h1>Smart links</h1><p>${ANSWER}</p>`)
    );
    expect(check.status).toBe('passed');
    expect(check.summary).toContain('word 2');
  });

  it('fails when the only paragraph is a tagline', () => {
    expect(
      auditDirectAnswer(page('<h1>Be found.</h1><p>Be understood.</p>')).status
    ).toBe('failed');
  });

  it('fails when the answer starts after the first 100 words', () => {
    const filler = Array.from({ length: 120 }, (_, i) => `w${i}`).join(' ');
    const check = auditDirectAnswer(
      page(`<div>${filler}</div><p>${ANSWER}</p>`)
    );
    expect(check.status).toBe('failed');
    expect(check.remediation).toContain('<p>');
  });

  it('ignores header chrome when counting the offset', () => {
    const [first] = paragraphsWithOffsets(page(`<p>${ANSWER}</p>`));
    expect(first?.offset).toBe(0);
  });

  it('requires terminal punctuation so fragments do not count', () => {
    expect(
      auditDirectAnswer(
        page('<p>Jovie profiles smart links notifications merch and pay</p>')
      ).status
    ).toBe('failed');
  });
});

describe('canonical and JSON-LD by family', () => {
  it('fails without a canonical and passes with one', () => {
    expect(auditCanonicalPresent(extractSeoHead(page(''))).status).toBe(
      'failed'
    );
    const head = extractSeoHead(
      page('', '<link rel="canonical" href="https://jov.ie/pay"/>')
    );
    expect(auditCanonicalPresent(head).status).toBe('passed');
  });

  it('accepts a pricing Offer nested under mainEntity', () => {
    const head = extractSeoHead(
      page(
        '',
        '<script type="application/ld+json">{"@type":"WebPage","mainEntity":{"@type":"ItemList","itemListElement":[{"@type":"ListItem","item":{"@type":"Product","offers":{"@type":"Offer","price":"0"}}}]}}</script>'
      )
    );
    expect(head.jsonLdTypes).toEqual(['WebPage']);
    expect(auditJsonLdForFamily(head, 'pricing').status).toBe('passed');
  });

  it('fails a pricing page that only declares WebPage', () => {
    const head = extractSeoHead(
      page(
        '',
        '<script type="application/ld+json">{"@type":"WebPage"}</script>'
      )
    );
    const check = auditJsonLdForFamily(head, 'pricing');
    expect(check.status).toBe('failed');
    expect(check.remediation).toContain('Offer');
  });

  it('fails a page with no JSON-LD and passes any type for open families', () => {
    expect(auditJsonLdForFamily(extractSeoHead(page('')), 'other').status).toBe(
      'failed'
    );
    const head = extractSeoHead(
      page('', '<script type="application/ld+json">{"@type":"Thing"}</script>')
    );
    expect(auditJsonLdForFamily(head, 'changelog').status).toBe('passed');
  });
});

describe('page families', () => {
  it('maps recipes and editorial paths', () => {
    expect(geoFamilyFor('/', 'homepage')).toBe('home');
    expect(geoFamilyFor('/pricing', 'pricing')).toBe('pricing');
    expect(geoFamilyFor('/product', 'feature')).toBe('product');
    expect(geoFamilyFor('/compare/linktree', 'comparison')).toBe('comparison');
    expect(geoFamilyFor('/compare', undefined)).toBe('hub');
    expect(geoFamilyFor('/compare/x', undefined)).toBe('comparison');
    expect(geoFamilyFor('/blog/the-contact-problem', undefined)).toBe(
      'article'
    );
    expect(geoFamilyFor('/blog/authors/tim', undefined)).toBe('other');
    expect(geoFamilyFor('/changelog/26.8.1', undefined)).toBe('changelog');
    expect(geoFamilyFor('/developers', undefined)).toBe('company');
    expect(geoFamilyFor('/waitlist', 'waitlist')).toBe('other');
  });

  it('only time-sensitive families require a revision date', () => {
    const requiring = Object.entries(GEO_FAMILY_RULES)
      .filter(([, rule]) => rule.requiresLastUpdated)
      .map(([family]) => family);
    expect(requiring.sort()).toEqual(['article', 'changelog', 'comparison']);
  });
});

describe('sibling links', () => {
  it('counts distinct body links to sibling pages, not chrome or self', () => {
    const html = page(
      '<a href="/product">P</a><a href="https://jov.ie/card/">C</a><a href="/compare/linktree">L</a><a href="/smart-links">self</a><a href="/product#x">dup</a><a href="https://example.com/pricing">ext</a><a href="mailto:a@b.c">m</a>'
    );
    const check = auditSiblingLinks(html, context());
    expect(check.status).toBe('passed');
    expect(check.summary).toBe(
      '3 sibling links: /product, /card, /compare/linktree'
    );
  });

  it('fails when only header and footer link out', () => {
    const check = auditSiblingLinks(
      page('<a href="/product">P</a>'),
      context()
    );
    expect(check.status).toBe('failed');
    expect(check.summary).toContain('1 sibling links');
  });

  it('normalizes internal links and skips malformed hrefs', () => {
    expect(
      internalLinkPaths(
        '<a href="/a/">x</a><a href="#top">t</a><a href="http://[bad">b</a><a>none</a>',
        ORIGIN
      )
    ).toEqual(['/a']);
  });
});

describe('last updated', () => {
  it('accepts a time element or a dated "Last updated" line', () => {
    expect(
      hasVisibleRevisionDate(page('<time datetime="2026-09-01">Sep 1</time>'))
    ).toBe(true);
    expect(
      hasVisibleRevisionDate(page('<p>Last updated: 2026-09-01</p>'))
    ).toBe(true);
    expect(
      hasVisibleRevisionDate(page('<p>Updated September 1, 2026</p>'))
    ).toBe(true);
    expect(hasVisibleRevisionDate(page('<p>We updated our plans.</p>'))).toBe(
      false
    );
  });

  it('is skipped for families that do not need it and fails when missing', () => {
    expect(auditLastUpdated(page(''), 'product')).toBeNull();
    expect(auditLastUpdated(page(''), 'comparison')?.status).toBe('failed');
  });
});

describe('auditGeo', () => {
  it('runs every per-page check and adds last-updated for comparisons', () => {
    const html = page(`<p>${ANSWER}</p>`);
    const ids = (family: 'product' | 'comparison') =>
      auditGeo(html, extractSeoHead(html), { ...context(), family }).map(
        check => check.id
      );
    expect(ids('product')).toEqual([
      'geo-direct-answer',
      'geo-canonical',
      'geo-jsonld-type',
      'geo-sibling-links',
    ]);
    expect(ids('comparison')).toContain('geo-last-updated');
  });
});

describe('auditOrphans', () => {
  it('fails sitemap pages no other page links to, chrome included', () => {
    const checks = auditOrphans(
      [
        {
          pathname: '/a',
          html: '<a href="/b">b</a><a href="/a">a</a>',
          inSitemap: true,
        },
        {
          pathname: '/b',
          html: '<footer><a href="/a">a</a></footer>',
          inSitemap: true,
        },
        { pathname: '/c', html: '<a href="/c">self</a>', inSitemap: true },
        { pathname: '/d', html: '', inSitemap: false },
      ],
      ORIGIN
    );
    expect(checks.get('/a')?.status).toBe('passed');
    expect(checks.get('/b')?.status).toBe('passed');
    expect(checks.get('/c')?.status).toBe('failed');
    expect(checks.has('/d')).toBe(false);
  });
});

describe('streamed segments and hidden spans', () => {
  it('reads a streamed Suspense segment in place of its fallback', () => {
    const html = page(
      '<!--$?--><template id="B:0"></template><div class="skeleton">Loading</div><!--/$--><p>Short tagline here.</p>'
    ).replace(
      '</body>',
      `<div hidden id="S:0"><h2>Plans</h2><p>${ANSWER}</p></div><script>$RC("B:0","S:0")</script></body>`
    );
    const inlined = inlineStreamedSegments(html);
    expect(inlined).not.toContain('Loading');
    expect(inlined).not.toContain('<div hidden id="S:0">');
    expect(inlined.indexOf(ANSWER)).toBeLessThan(
      inlined.indexOf('Short tagline')
    );
    const [first] = paragraphsWithOffsets(html);
    expect(first?.text).toBe(ANSWER);
    expect(auditDirectAnswer(html).status).toBe('passed');
  });

  it('leaves the HTML alone when a segment cannot be matched', () => {
    const html = '<p>x</p><script>$RC("B:9","S:9")</script>';
    expect(inlineStreamedSegments(html)).toBe(html);
  });

  it('drops aria-hidden layout placeholder text from paragraphs', () => {
    const html = page(
      '<p><span aria-hidden="true">Confirm your subscription to receive Jovie changelog emails.</span><span>New features from Jovie.</span></p>'
    );
    expect(paragraphsWithOffsets(html)[0]?.text).toBe(
      'New features from Jovie.'
    );
    expect(auditDirectAnswer(html).status).toBe('failed');
  });
});

describe('trimTrailing and revision text', () => {
  it('trims only trailing characters from the set', () => {
    expect(trimTrailing('/a//', '/')).toBe('/a');
    expect(trimTrailing('https://jov.ie/pay).', '.,;:)')).toBe(
      'https://jov.ie/pay'
    );
    expect(trimTrailing('///', '/')).toBe('');
  });

  it('matches dated revision lines in each supported format', () => {
    expect(hasRevisionDateText('Published on 1 Sep 2026')).toBe(true);
    expect(hasRevisionDateText('Last reviewed: Sept. 1, 2026')).toBe(true);
    expect(hasRevisionDateText('updated 2026-09-01 by the team')).toBe(true);
    expect(hasRevisionDateText('Published by Jovie')).toBe(false);
  });
});
