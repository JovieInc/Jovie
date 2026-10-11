import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  getPageRecordContracts,
  type PageRecordPageContract,
} from '@/data/marketing/factory/pageRecordContract';
import { validateStageReceipt } from '@/data/marketing/factory/spine';
import type { RouteManifestEntry } from '@/data/marketing/routeManifest';
import {
  certifySweep,
  compareToBaseline,
  failureMap,
  SEO_CERTIFY_BASELINE_SCHEMA,
  type SeoSweepPage,
  type SeoSweepTarget,
  shrinkBaseline,
  siblingPathMatcher,
  sweepTargets,
} from '@/lib/seo/seo-certify-sweep';
import {
  fetchPage,
  loadSeoCertifyBaseline,
  readBuildPage,
  readSiteFile,
} from '../../../scripts/seo-certify';

const WORDS = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
const NOW = new Date('2026-09-29T12:00:00.000Z');
const SHA = 'a'.repeat(40);

function entry(
  url: string,
  extra: Partial<RouteManifestEntry> = {}
): RouteManifestEntry {
  return {
    glob: `(marketing)${url}/page.tsx`,
    recipeId: 'feature',
    renderedSections: [],
    bindingEvidence: { status: 'verified', source: 'test' },
    status: 'active',
    specVersion: '1',
    url,
    ...extra,
  };
}

function html(pathname: string, body: string, head = ''): string {
  return `<!doctype html><html lang="en"><head>
<title>Smart links for artists | Jovie</title>
<meta name="description" content="One link that routes every fan to the right release, platform and ticket without a landing page."/>
<link rel="canonical" href="https://jov.ie${pathname}"/>
<meta property="og:title" content="Smart links"/>
<meta property="og:description" content="One link for every fan."/>
<meta property="og:image" content="https://jov.ie/og/default.png"/>
<meta name="twitter:card" content="summary_large_image"/>
${head}</head><body><header><nav><a href="/pricing">Pricing</a></nav></header><main><h1>Smart links</h1>${body}</main><footer></footer></body></html>`;
}

const PRODUCT_LD =
  '<script type="application/ld+json">{"@type":"SoftwareApplication"}</script>';
const GOOD_BODY = `<p>Jovie smart links send every fan to the right place in one tap.</p><p>${WORDS}</p><a href="/pricing">p</a><a href="/card">c</a><a href="/pay">y</a>`;

function target(pathname: string, inSitemap = true): SeoSweepTarget {
  return {
    pathname,
    manifestUrl: pathname,
    recipeId: 'feature',
    inSitemap,
    family: 'product',
  };
}

function sweep(pages: SeoSweepPage[], llmsTxt: string | null = null) {
  return certifySweep({
    pages,
    sourceSha: SHA,
    runRef: 'test-run',
    now: NOW,
    llmsTxt,
    isSiblingPath: path =>
      ['/pricing', '/card', '/pay', '/smart-links'].includes(path),
  });
}

describe('sweepTargets', () => {
  it('certifies the live homepage while the retired /new alias stays a redirect', () => {
    const paths = sweepTargets().map(target => target.pathname);
    expect(paths).toContain('/');
    expect(paths).not.toContain('/new');
  });

  it('resolves wildcards, skips redirects, fixtures, inactive and duplicates', () => {
    const targets = sweepTargets([
      entry('/smart-links'),
      entry('/compare/*', {
        recipeId: 'comparison',
        healthCheck: { path: '/compare/linktree', expected: 'page' },
      }),
      entry('/blog/*', { recipeId: undefined }),
      entry('/old', { healthCheck: { path: '/old', expected: 'redirect' } }),
      entry('/gone', { status: 'deprecated' }),
      entry('/renders/catalog', { recipeId: undefined }),
      entry('/smart-links'),
      entry('/voice', { noindex: true }),
    ]);
    expect(targets.map(t => t.pathname)).toEqual([
      '/smart-links',
      '/compare/linktree',
      '/voice',
    ]);
    expect(targets[1]).toMatchObject({
      manifestUrl: '/compare/*',
      family: 'comparison',
    });
    expect(targets[2]?.inSitemap).toBe(false);
  });

  it('covers the real manifest without wildcard or fixture paths', () => {
    const targets = sweepTargets();
    expect(targets.length).toBeGreaterThan(20);
    for (const t of targets) {
      expect(t.pathname).not.toContain('*');
      expect(t.pathname.startsWith('/renders')).toBe(false);
    }
    expect(targets.find(t => t.pathname === '/pricing')).toMatchObject({
      inSitemap: true,
      family: 'pricing',
    });
  });
});

describe('per-record sweep (JOV-7283)', () => {
  const artists = getPageRecordContracts().find(
    contract => contract.recordId === 'solutions.artists'
  ) as PageRecordPageContract;
  const founders: PageRecordPageContract = {
    ...artists,
    url: '/solutions/founders',
    recordId: 'solutions.founders',
    audience: 'founders',
    copyScope: 'shared',
    forbiddenTerms: ['fan', 'music'],
  };

  it('sweeps every routed record path of a family wildcard', () => {
    const family = entry('/solutions/*', {
      recipeId: 'artist-lp',
      healthCheck: { path: '/solutions/artists', expected: 'page' },
    });
    const targets = sweepTargets([family], [artists, founders]);
    expect(targets.map(t => t.pathname)).toEqual([
      '/solutions/artists',
      '/solutions/founders',
    ]);
    expect(targets[1]?.recordContract?.recordId).toBe('solutions.founders');
    // Without records the wildcard falls back to its health-check path.
    expect(sweepTargets([family], []).map(t => t.pathname)).toEqual([
      '/solutions/artists',
    ]);
    expect(
      sweepTargets().find(t => t.pathname === '/solutions/artists')
        ?.recordContract?.copyScope
    ).toBe('music');
  });

  it('fails copy-scope when a record page renders a forbidden term', () => {
    const run = (contract: PageRecordPageContract) =>
      sweep([
        {
          target: {
            ...target(contract.url, false),
            recordContract: contract,
          },
          html: html(contract.url, GOOD_BODY, PRODUCT_LD),
          status: 200,
          source: 'x',
        },
      ])[0]?.certification.checks.find(check => check.id === 'copy-scope');
    expect(run(artists)).toMatchObject({ status: 'passed' });
    const failed = run(founders);
    expect(failed).toMatchObject({ dimension: 'copy', status: 'failed' });
    expect(failed?.summary).toContain('fan');
  });
});

describe('siblingPathMatcher', () => {
  it('matches exact published pages and one-segment wildcard children', () => {
    const matches = siblingPathMatcher([
      entry('/card'),
      entry('/compare/*', { recipeId: 'comparison' }),
      entry('/voice', { noindex: true }),
      entry('/new', { aliasOf: '/' }),
    ]);
    expect(matches('/card')).toBe(true);
    expect(matches('/compare/linktree')).toBe(true);
    expect(matches('/compare/')).toBe(false);
    expect(matches('/compare/a/b')).toBe(false);
    expect(matches('/voice')).toBe(false);
    expect(matches('/new')).toBe(false);
  });
});

describe('certifySweep', () => {
  it('passes a clean page and emits a valid harness-passed stage receipt', () => {
    const [result] = sweep(
      [
        {
          target: target('/smart-links'),
          html: html('/smart-links', GOOD_BODY, PRODUCT_LD),
          status: 200,
          source: '.next/server/app/smart-links.html',
        },
        {
          target: target('/pricing', false),
          html: '<a href="/smart-links">s</a>',
          status: 200,
          source: 'x',
        },
      ],
      '- [Smart links](https://jov.ie/smart-links): one link'
    );
    const failed = result?.certification.checks.filter(
      check => check.status === 'failed'
    );
    expect(failed).toEqual([]);
    expect(result?.certification.passed).toBe(true);
    expect(result?.artifact.schemaIssues).toEqual([]);
    expect(result?.artifact.value).toMatchObject({
      canonical: 'https://jov.ie/smart-links',
      jsonLdTypes: ['SoftwareApplication'],
      siblingLinks: ['/pricing', '/card', '/pay'],
      llmsEntry: true,
    });
    const receipt = result?.stageReceipt;
    expect(receipt).toMatchObject({
      stage: 'seo-agent',
      pageId: 'route:/smart-links',
      passed: true,
      certifier: 'harness',
      at: NOW.toISOString(),
    });
    expect(validateStageReceipt(receipt)).toEqual([]);
    expect(receipt?.invariantsPassed).toContain('geo:geo-orphan');

    const packet = result?.packet;
    expect(packet?.contract).toBe('jovie.certification/v1');
    expect(packet?.subject.id).toBe('marketing-route:/smart-links');
    expect(packet?.source?.sha).toBe(SHA);
    expect(packet?.invariantEvaluation.map(r => r.id)).toEqual([
      'seo.technical',
      'seo.agentic',
      'seo.copy',
      'seo.geo',
    ]);
    for (const receipt of packet?.invariantEvaluation ?? []) {
      expect(receipt.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(receipt.ref).toBe('test-run#/smart-links');
    }
  });

  it('fails GEO checks and never marks the stage receipt passed', () => {
    const [result] = sweep([
      {
        target: target('/smart-links'),
        html: html('/smart-links', `<p>${WORDS}</p>`),
        status: 200,
        source: 'x',
      },
    ]);
    const failed = failureMap([result as NonNullable<typeof result>]);
    expect(failed['/smart-links']).toEqual([
      'agentic:structured-data',
      'geo:geo-direct-answer',
      'geo:geo-jsonld-type',
      'geo:geo-orphan',
      'geo:geo-sibling-links',
    ]);
    expect(result?.stageReceipt.passed).toBe(false);
    expect(result?.stageReceipt.invariantsFailed).toContain(
      'seo-agent-artifact-schema'
    );
    expect(result?.stageReceipt.evaluators[0]?.verdict).toBe('fail');
    expect(validateStageReceipt(result?.stageReceipt)).toEqual([]);
  });

  it('audits llms.txt and robots.txt as site pseudo-routes (JOV-7259)', () => {
    const results = certifySweep({
      pages: [
        {
          target: target('/smart-links'),
          html: html('/smart-links', GOOD_BODY, PRODUCT_LD),
          status: 200,
          source: 'x',
        },
      ],
      sourceSha: SHA,
      runRef: 'test-run',
      now: NOW,
      llmsTxt:
        '# Jovie\n\n> one product for presence\n\n## Pages\n\n- [Smart links](https://jov.ie/smart-links)\n',
      robotsTxt:
        'User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nSitemap: https://jov.ie/sitemap.xml\n',
      isSiblingPath: () => false,
    });
    const llms = results.find(result => result.target.pathname === '/llms.txt');
    expect(llms?.certification.passed).toBe(true);
    expect(llms?.certification.checks.map(check => check.id)).toEqual([
      'llms-txt-h1',
      'llms-txt-summary',
      'llms-txt-links',
    ]);
    expect(llms?.packet.subject.kind).toBe('site-file');

    const robots = results.find(
      result => result.target.pathname === '/robots.txt'
    );
    const searchCheck = robots?.certification.checks.find(
      check => check.id === 'robots-search-crawlers'
    );
    // Only one of five search crawlers has a rule → site evidence fails.
    expect(searchCheck?.status).toBe('failed');
    expect(robots?.certification.passed).toBe(false);
    expect(
      robots?.certification.checks.find(
        check => check.id === 'robots-training-tokens'
      )?.status
    ).toBe('warn');
  });

  it('flags cohort-templated titles, failing record pages (JOV-7259)', () => {
    const contract = getPageRecordContracts().find(
      c => c.recordId === 'solutions.artists'
    ) as PageRecordPageContract;
    const results = certifySweep({
      pages: [
        {
          target: { ...target('/solutions/artists'), recordContract: contract },
          html: html('/solutions/artists', GOOD_BODY, PRODUCT_LD),
          status: 200,
          source: 'x',
        },
        {
          target: target('/voice'),
          html: html('/voice', GOOD_BODY, PRODUCT_LD),
          status: 200,
          source: 'x',
        },
      ],
      sourceSha: SHA,
      runRef: 'test-run',
      now: NOW,
      llmsTxt: null,
    });
    // Both pages render the same title/description from the html() fixture.
    const recordPage = results.find(
      result => result.target.pathname === '/solutions/artists'
    );
    const handPage = results.find(
      result => result.target.pathname === '/voice'
    );
    expect(
      recordPage?.certification.checks.find(
        check => check.id === 'templated-metadata'
      )?.status
    ).toBe('failed');
    expect(
      handPage?.certification.checks.find(
        check => check.id === 'templated-metadata'
      )?.status
    ).toBe('warn');
  });

  it('skips GEO for pages outside the sitemap', () => {
    const [result] = sweep([
      {
        target: target('/voice', false),
        html: html('/voice', `<p>${WORDS}</p>`, PRODUCT_LD),
        status: 200,
        source: 'x',
      },
    ]);
    expect(
      result?.certification.checks.some(check => check.dimension === 'geo')
    ).toBe(false);
  });

  it('reports a missing rendered page as an html-source failure', () => {
    const [result] = sweep([
      {
        target: target('/waitlist'),
        html: null,
        status: 0,
        source: '.next/server/app/waitlist.html',
      },
    ]);
    expect(result?.certification.checks).toEqual([
      expect.objectContaining({
        id: 'html-source',
        status: 'failed',
        summary: 'no rendered HTML at .next/server/app/waitlist.html',
      }),
    ]);
    expect(result?.packet.source?.digest).toBeNull();
    expect(result?.stageReceipt.passed).toBe(false);
  });
});

describe('shrink-only baseline', () => {
  const baseline = {
    schema: SEO_CERTIFY_BASELINE_SCHEMA,
    failures: {
      '/pricing': ['geo:geo-jsonld-type', 'technical:open-graph'],
      '/removed': ['geo:geo-orphan'],
    },
  };

  it('tolerates existing debt and flags new failures', () => {
    const comparison = compareToBaseline(
      {
        '/pricing': ['geo:geo-jsonld-type', 'technical:open-graph'],
        '/card': ['copy:copy-lint'],
      },
      baseline,
      ['/pricing', '/card', '/removed']
    );
    expect(comparison.regressions).toEqual(['/card copy:copy-lint']);
    expect(comparison.resolved).toEqual(['/removed geo:geo-orphan']);
  });

  it('treats debt on routes no longer swept as resolved', () => {
    const comparison = compareToBaseline(
      { '/pricing': ['geo:geo-jsonld-type', 'technical:open-graph'] },
      baseline,
      ['/pricing']
    );
    expect(comparison).toEqual({
      regressions: [],
      resolved: ['/removed geo:geo-orphan'],
    });
  });

  it('shrinks without ever adding a failure', () => {
    expect(
      shrinkBaseline(baseline, {
        '/pricing': ['technical:open-graph'],
        '/card': ['copy:copy-lint'],
      })
    ).toEqual({
      schema: SEO_CERTIFY_BASELINE_SCHEMA,
      failures: { '/pricing': ['technical:open-graph'] },
    });
  });

  it('checked-in baseline only names swept routes and known dimensions', () => {
    const checkedIn = loadSeoCertifyBaseline();
    const swept = new Set(sweepTargets().map(t => t.pathname));
    for (const [path, keys] of Object.entries(checkedIn.failures)) {
      expect(swept.has(path), path).toBe(true);
      for (const key of keys) {
        expect(key).toMatch(/^(technical|agentic|copy|geo):[\w-]+$/);
      }
    }
  });

  it('rejects a baseline with the wrong schema', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'seo-baseline-')), 'b.json');
    writeFileSync(path, JSON.stringify({ schema: 'other/v1', failures: {} }));
    expect(() => loadSeoCertifyBaseline(path)).toThrow(/expected schema/);
  });
});

describe('missing site evidence', () => {
  it('fails requested site files whose fetch or build artifact is missing', () => {
    const results = certifySweep({
      pages: [],
      sourceSha: SHA,
      runRef: 'test-run',
      now: NOW,
      llmsTxt: null,
      robotsTxt: null,
    });
    for (const pathname of ['/llms.txt', '/robots.txt']) {
      const result = results.find(item => item.target.pathname === pathname);
      expect(result?.certification.passed).toBe(false);
      expect(
        result?.certification.checks.some(check => check.status === 'failed')
      ).toBe(true);
    }
  });
});

describe('SEO evidence readers', () => {
  it('reads available artifacts and marks missing site/page evidence explicitly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seo-readers-'));
    writeFileSync(join(dir, 'llms.txt.body'), '# Jovie');
    writeFileSync(join(dir, 'index.html'), '<h1>Jovie</h1>');
    writeFileSync(join(dir, 'index.meta'), JSON.stringify({ status: 404 }));
    expect(await readSiteFile('/llms.txt', dir)).toBe('# Jovie');
    expect(await readSiteFile('/robots.txt', dir)).toBeNull();
    expect(readBuildPage(dir, target('/'))).toMatchObject({
      html: '<h1>Jovie</h1>',
      status: 404,
    });
    expect(readBuildPage(dir, target('/absent'))).toMatchObject({
      html: null,
      status: 0,
    });
  });

  it('bounds HTTP reads and preserves absent, redirect, network and body failures', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    try {
      fetchMock.mockResolvedValueOnce(new Response('# Jovie'));
      expect(await readSiteFile('/llms.txt', '', 'https://jov.ie')).toBe(
        '# Jovie'
      );
      expect(fetchMock).toHaveBeenLastCalledWith(
        new URL('https://jov.ie/llms.txt'),
        expect.objectContaining({
          redirect: 'manual',
          signal: expect.any(AbortSignal),
        })
      );
      for (const status of [404, 302]) {
        fetchMock.mockResolvedValueOnce(new Response('', { status }));
        expect(
          await readSiteFile('/robots.txt', '', 'https://jov.ie')
        ).toBeNull();
      }
      fetchMock.mockRejectedValueOnce(new Error('network'));
      expect(await readSiteFile('/llms.txt', '', 'https://jov.ie')).toBeNull();
      const broken = new Response('');
      vi.spyOn(broken, 'text').mockRejectedValue(new Error('body interrupted'));
      fetchMock.mockResolvedValueOnce(broken);
      expect(await readSiteFile('/llms.txt', '', 'https://jov.ie')).toBeNull();
      fetchMock.mockResolvedValueOnce(new Response('<h1>Found</h1>'));
      expect(
        await fetchPage('https://jov.ie', target('/product'))
      ).toMatchObject({
        html: '<h1>Found</h1>',
        status: 200,
        source: 'https://jov.ie/product',
      });
      fetchMock.mockRejectedValueOnce(new Error('timeout'));
      expect(
        await fetchPage('https://jov.ie', target('/product'))
      ).toMatchObject({ html: null, status: 0 });
    } finally {
      fetchMock.mockRestore();
    }
  });
});
