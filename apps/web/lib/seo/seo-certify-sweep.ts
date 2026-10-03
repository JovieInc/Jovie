/**
 * `seo:certify` sweep (JOV-7249): every public route in MARKETING_ROUTE_MANIFEST
 * runs the page-certification audits (technical, agentic, copy) plus the GEO
 * checks against its rendered HTML, and emits:
 *
 * - `jovie.certification/v1` review packets (seo.* receipts on the
 *   invariant_evaluation tier, digest-bound to the checks they report), and
 * - `jovie.factory-receipt/v1` stage receipts for the `seo-agent` stage, with
 *   `passed` set only through applyStagePassedBit.
 *
 * Failures ratchet against lib/seo/seo-certify-baseline.json (loaded by
 * scripts/seo-certify.ts): existing debt never fails
 * the sweep, a new (route, check) failure does, and fixed debt must be removed
 * from the baseline so it cannot silently come back.
 */
import { createHash } from 'node:crypto';
import { findForbiddenTerms } from '@/data/marketing/factory/pageRecord';
import {
  getPageRecordContracts,
  type PageRecordPageContract,
} from '@/data/marketing/factory/pageRecordContract';
import {
  applyStagePassedBit,
  FACTORY_CERTIFIER_HARNESS,
  FactorySeoAgentSchema,
  type StageReceipt,
} from '@/data/marketing/factory/spine';
import {
  MARKETING_ROUTE_MANIFEST,
  type RouteManifestEntry,
} from '@/data/marketing/routeManifest';
import type {
  CertificationEvidenceReceipt,
  CertificationReviewPacket,
} from '@/lib/agent-os/certification';
import { JOVIE_CERTIFICATION_CONTRACT } from '@/lib/agent-os/certification';
import { isRenderFixturePathname } from '@/lib/render-fixture-policy';
import {
  auditCohortMetadata,
  auditLlmsTxtStructure,
  auditRobotsTxt,
  cohortPageMeta,
} from '@/lib/seo/agent-site-readiness';
import {
  auditGeo,
  auditOrphans,
  type GeoPageFamily,
  geoFamilyFor,
  SIBLING_LINK_RANGE,
  siblingLinks,
  trimTrailing,
} from '@/lib/seo/geo-certification';
import {
  certifyPage,
  type ExtractedSeoHead,
  extractSeoHead,
  SEO_CERTIFICATION_CONTRACT,
  type SeoCheck,
  type SeoPageCertification,
  toCertificationReceipts,
} from '@/lib/seo/page-certification';
import { isSitemapIndexableMarketingRoute } from '@/lib/seo/sitemap-publication';

export const SEO_CERTIFY_SITE_ORIGIN = 'https://jov.ie';
export const SEO_CERTIFY_BASELINE_SCHEMA =
  'jovie.seo-certify-baseline/v1' as const;

export interface SeoSweepTarget {
  /** Concrete public pathname the sweep renders. */
  readonly pathname: string;
  /** Manifest url (may be a wildcard like `/compare/*`). */
  readonly manifestUrl: string;
  readonly recipeId: string | undefined;
  readonly inSitemap: boolean;
  readonly family: GeoPageFamily;
  /** Per-record contract when the path is a routed page record (JOV-7283). */
  readonly recordContract?: PageRecordPageContract;
}

function recordFamilyPrefix(url: string): string | null {
  const match = /^(\/[a-z0-9-]+)\/[a-z0-9-]+$/u.exec(url);
  return match ? `${match[1]}/*` : null;
}

/**
 * Active manifest routes that render a page. A family wildcard with page
 * records sweeps every routed record path; other wildcards resolve through
 * their health-check fixture path. Redirects, not-found fixtures and render
 * fixtures are not pages and are skipped.
 */
export function sweepTargets(
  manifest: readonly RouteManifestEntry[] = MARKETING_ROUTE_MANIFEST,
  recordContracts: readonly PageRecordPageContract[] = getPageRecordContracts()
): SeoSweepTarget[] {
  const targets: SeoSweepTarget[] = [];
  for (const entry of manifest) {
    if (entry.status !== 'active') continue;
    if ((entry.healthCheck?.expected ?? 'page') !== 'page') continue;
    const records = entry.url.includes('*')
      ? recordContracts.filter(c => recordFamilyPrefix(c.url) === entry.url)
      : [];
    const paths: [string | undefined, PageRecordPageContract | undefined][] =
      records.length > 0
        ? records.map(contract => [contract.url, contract])
        : [
            [
              entry.url.includes('*') ? entry.healthCheck?.path : entry.url,
              undefined,
            ],
          ];
    for (const [pathname, recordContract] of paths) {
      if (!pathname || pathname.includes('*')) continue;
      if (isRenderFixturePathname(pathname)) continue;
      if (targets.some(target => target.pathname === pathname)) continue;
      targets.push({
        pathname,
        manifestUrl: entry.url,
        recipeId: entry.recipeId,
        inSitemap: isSitemapIndexableMarketingRoute(entry),
        family: geoFamilyFor(pathname, entry.recipeId),
        ...(recordContract ? { recordContract } : {}),
      });
    }
  }
  return targets;
}

/**
 * Per-record copy scope: the rendered title, description and page-owned text
 * must not use a term the record's brief forbids.
 */
export function auditRecordCopyScope(
  contract: PageRecordPageContract,
  head: ReturnType<typeof extractSeoHead>
): SeoCheck {
  const text = [head.title, head.description, head.visibleText]
    .filter(Boolean)
    .join('\n');
  const found = findForbiddenTerms(text, contract.forbiddenTerms);
  return found.length === 0
    ? {
        dimension: 'copy',
        id: 'copy-scope',
        status: 'passed',
        summary: `${contract.recordId}: ${contract.copyScope} scope holds`,
      }
    : {
        dimension: 'copy',
        id: 'copy-scope',
        status: 'failed',
        summary: `${contract.recordId}: ${contract.copyScope} scope uses ${found.slice(0, 5).join(', ')}`,
        remediation:
          'Rewrite the copy for the record audience, or name the term in brief.allowedTerms (docs/marketing/LANGUAGE.md).',
      };
}

/** Sibling-link targets: sitemap-published manifest pages (wildcards by prefix). */
export function siblingPathMatcher(
  manifest: readonly RouteManifestEntry[] = MARKETING_ROUTE_MANIFEST
): (pathname: string) => boolean {
  const published = manifest.filter(isSitemapIndexableMarketingRoute);
  const exact = new Set(
    published.filter(entry => !entry.url.includes('*')).map(entry => entry.url)
  );
  const prefixes = published
    .filter(entry => entry.url.endsWith('/*'))
    .map(entry => entry.url.slice(0, -1));
  return pathname =>
    exact.has(pathname) ||
    prefixes.some(
      prefix =>
        pathname.startsWith(prefix) &&
        !pathname.slice(prefix.length).includes('/') &&
        pathname.length > prefix.length
    );
}

export interface SeoSweepPage {
  readonly target: SeoSweepTarget;
  /** Rendered HTML, or null when the source had no page for the route. */
  readonly html: string | null;
  readonly status: number;
  /** Where the HTML came from (build output path or URL), for receipt refs. */
  readonly source: string;
}

export interface SeoSweepRouteResult {
  readonly target: SeoSweepTarget;
  readonly certification: SeoPageCertification;
  readonly packet: CertificationReviewPacket;
  readonly stageReceipt: StageReceipt;
  /** `seo-agent` stage artifact plus its FactorySeoAgentSchema issues. */
  readonly artifact: {
    readonly value: unknown;
    readonly schemaIssues: readonly string[];
  };
}

export interface SeoSweepInput {
  readonly pages: readonly SeoSweepPage[];
  readonly sourceSha: string | null;
  readonly runRef: string;
  readonly now: Date;
  /** llms.txt body from the same build, when available. */
  readonly llmsTxt: string | null;
  /** robots.txt body from the same build, when available. */
  readonly robotsTxt?: string | null;
  readonly isSiblingPath?: (pathname: string) => boolean;
  readonly siteOrigin?: string;
}

export function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function missingSource(page: SeoSweepPage, siteOrigin: string) {
  const check: SeoCheck = {
    dimension: 'technical',
    id: 'html-source',
    status: 'failed',
    summary: `no rendered HTML at ${page.source}`,
    remediation:
      'Prerender the route (generateStaticParams / static metadata) or sweep a running server with --base-url.',
  };
  return {
    url: new URL(page.target.pathname, siteOrigin).toString(),
    pathname: page.target.pathname,
    surface: 'marketing' as const,
    passed: false,
    checks: [check],
  } satisfies SeoPageCertification;
}

function llmsListsPath(
  llmsTxt: string | null,
  pathname: string,
  siteOrigin: string
) {
  if (!llmsTxt) return false;
  const url = trimTrailing(new URL(pathname, siteOrigin).toString(), '/');
  return llmsTxt
    .split(/[\s()<>[\]]+/)
    .some(token => trimTrailing(trimTrailing(token, '.,;:'), '/') === url);
}

function seoReceiptsWithDigest(
  certification: SeoPageCertification,
  sourceSha: string | null,
  ref: string
): CertificationEvidenceReceipt[] {
  return toCertificationReceipts(certification, sourceSha, ref).map(
    receipt => ({
      ...receipt,
      // Bind each receipt to the exact checks it summarizes.
      digest: sha256(
        JSON.stringify(
          certification.checks.filter(
            check => `seo.${check.dimension}` === receipt.id
          )
        )
      ),
    })
  );
}

function finalizeResult(
  target: SeoSweepTarget,
  source: string,
  html: string | null,
  certification: SeoPageCertification,
  artifact: Record<string, unknown>,
  input: SeoSweepInput,
  /** Site-file pseudo-routes are not shaped like pages; skip the page schema. */
  pageArtifact = true
): SeoSweepRouteResult {
  const parsedArtifact = pageArtifact
    ? FactorySeoAgentSchema.safeParse(artifact)
    : null;
  const schemaIssues =
    parsedArtifact === null || parsedArtifact.success
      ? []
      : parsedArtifact.error.issues.map(
          issue => `${issue.path.join('.') || 'artifact'}: ${issue.message}`
        );
  const receipts = seoReceiptsWithDigest(
    certification,
    input.sourceSha,
    input.runRef
  );
  const failedChecks = certification.checks.filter(
    check => check.status === 'failed'
  );
  const scored = certification.checks.filter(check => check.status !== 'warn');
  const stageReceipt = applyStagePassedBit(
    {
      schema: 'jovie.factory-receipt/v1',
      pageId: `route:${target.pathname}`,
      stage: 'seo-agent',
      attempt: 1,
      inputDigest: sha256(html ?? ''),
      outputDigest: sha256(JSON.stringify(artifact)),
      producer: null,
      evaluators: [
        {
          id: 'seo-certify',
          family: FACTORY_CERTIFIER_HARNESS,
          kind: 'deterministic',
          verdict: failedChecks.length === 0 ? 'pass' : 'fail',
          score:
            scored.length === 0
              ? 0
              : (scored.length - failedChecks.length) / scored.length,
          rubricVersion: SEO_CERTIFICATION_CONTRACT,
        },
      ],
      invariantsPassed: certification.checks
        .filter(check => check.status !== 'failed')
        .map(check => `${check.dimension}:${check.id}`),
      invariantsFailed: [
        ...failedChecks.map(check => `${check.dimension}:${check.id}`),
        ...(schemaIssues.length > 0 ? ['seo-agent-artifact-schema'] : []),
      ],
      at: input.now.toISOString(),
    },
    { certifier: FACTORY_CERTIFIER_HARNESS }
  );

  const packet: CertificationReviewPacket = {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    subject: {
      id: `marketing-route:${target.pathname}`,
      kind: pageArtifact ? 'marketing-route' : 'site-file',
      title: target.pathname,
    },
    source: input.sourceSha
      ? {
          repository: 'JovieInc/Jovie',
          ref: 'main',
          sha: input.sourceSha,
          paths: [source],
          digest: html === null ? null : sha256(html),
        }
      : null,
    canonicalReferences: [],
    invariantEvaluation: receipts,
    testsCoverage: [],
    visualProof: [],
    requiredVariants: [],
    itemMedia: [],
  };

  return {
    target,
    certification,
    packet,
    stageReceipt,
    artifact: { value: artifact, schemaIssues },
  };
}

/** Site-file pseudo-target for `/llms.txt` and `/robots.txt` results. */
function siteTarget(pathname: string): SeoSweepTarget {
  return {
    pathname,
    manifestUrl: pathname,
    recipeId: undefined,
    inSitemap: false,
    family: 'other',
  };
}

export function certifySweep(input: SeoSweepInput): SeoSweepRouteResult[] {
  const siteOrigin = input.siteOrigin ?? SEO_CERTIFY_SITE_ORIGIN;
  const isSiblingPath = input.isSiblingPath ?? siblingPathMatcher();
  const rendered = input.pages.filter(
    (page): page is SeoSweepPage & { html: string } => page.html !== null
  );
  const orphans = auditOrphans(
    rendered.map(page => ({
      pathname: page.target.pathname,
      html: page.html,
      inSitemap: page.target.inSitemap,
    })),
    siteOrigin
  );

  // Heads are shared between the per-page checks and the cohort pass.
  const heads = new Map(
    rendered.map(page => [page.target.pathname, extractSeoHead(page.html)])
  );
  const cohortFindings = auditCohortMetadata(
    rendered
      .filter(page => page.status === 200)
      .map(page =>
        cohortPageMeta(
          page.target.pathname,
          heads.get(page.target.pathname) as ExtractedSeoHead,
          page.target.inSitemap,
          page.target.recordContract !== undefined
        )
      )
  );

  const results = input.pages.map(page => {
    const { target } = page;
    const url = new URL(target.pathname, siteOrigin).toString();
    let certification: SeoPageCertification;
    let artifact: Record<string, unknown> = { pageId: target.pathname };
    if (page.html === null) {
      certification = missingSource(page, siteOrigin);
    } else {
      const base = certifyPage(
        { url, status: page.status, html: page.html },
        { siteOrigin, inSitemap: target.inSitemap }
      );
      const head = heads.get(target.pathname) as ExtractedSeoHead;
      const geoContext = {
        pathname: target.pathname,
        family: target.family,
        siteOrigin,
        isSiblingPath,
      };
      // GEO is a publication-quality bar: only sitemap pages are held to it.
      const geoChecks =
        target.inSitemap && page.status === 200
          ? [
              ...auditGeo(page.html, head, geoContext),
              ...(orphans.has(target.pathname)
                ? [orphans.get(target.pathname) as SeoCheck]
                : []),
            ]
          : [];
      const cohortCheck = cohortFindings.get(target.pathname);
      const checks = [
        ...base.checks,
        ...geoChecks,
        ...(cohortCheck ? [cohortCheck] : []),
        ...(target.recordContract
          ? [auditRecordCopyScope(target.recordContract, head)]
          : []),
      ];
      certification = {
        ...base,
        checks,
        passed: checks.every(check => check.status !== 'failed'),
      };
      artifact = {
        pageId: target.pathname,
        canonical: head.canonical ?? '',
        title: head.title ?? '',
        description: head.description ?? '',
        jsonLdTypes: [...new Set(head.jsonLdTypes)],
        siblingLinks: siblingLinks(page.html, geoContext).slice(
          0,
          SIBLING_LINK_RANGE.max
        ),
        llmsEntry: llmsListsPath(input.llmsTxt, target.pathname, siteOrigin),
      };
    }
    return finalizeResult(
      target,
      page.source,
      page.html,
      certification,
      artifact,
      input
    );
  });

  // Site-level files ride the same receipts/baseline as pseudo-routes
  // (JOV-7259): `/llms.txt` structure and `robots.txt` crawler purpose.
  if (input.llmsTxt !== null && input.llmsTxt !== undefined) {
    const target = siteTarget('/llms.txt');
    const checks = auditLlmsTxtStructure(input.llmsTxt);
    results.push(
      finalizeResult(
        target,
        'llms.txt.body',
        input.llmsTxt,
        {
          url: new URL(target.pathname, siteOrigin).toString(),
          pathname: target.pathname,
          surface: 'marketing',
          passed: checks.every(item => item.status !== 'failed'),
          checks,
        },
        { pageId: target.pathname, scope: 'site' },
        input,
        false
      )
    );
  }
  if (input.robotsTxt !== null && input.robotsTxt !== undefined) {
    const target = siteTarget('/robots.txt');
    const checks = auditRobotsTxt(input.robotsTxt);
    results.push(
      finalizeResult(
        target,
        'robots.txt.body',
        input.robotsTxt,
        {
          url: new URL(target.pathname, siteOrigin).toString(),
          pathname: target.pathname,
          surface: 'marketing',
          passed: checks.every(item => item.status !== 'failed'),
          checks,
        },
        { pageId: target.pathname, scope: 'site' },
        input,
        false
      )
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Shrink-only baseline
// ---------------------------------------------------------------------------

export interface SeoCertifyBaseline {
  readonly schema: typeof SEO_CERTIFY_BASELINE_SCHEMA;
  /** pathname -> failing `dimension:check` keys accepted as existing debt. */
  readonly failures: Readonly<Record<string, readonly string[]>>;
}

export function failureMap(
  results: readonly Pick<SeoSweepRouteResult, 'certification'>[]
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const { certification } of results) {
    const keys = certification.checks
      .filter(check => check.status === 'failed')
      .map(check => `${check.dimension}:${check.id}`)
      .sort((a, b) => a.localeCompare(b));
    if (keys.length > 0) map[certification.pathname] = [...new Set(keys)];
  }
  return Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  );
}

export interface BaselineComparison {
  /** Failures not in the baseline: these fail the sweep. */
  readonly regressions: readonly string[];
  /** Baseline entries that now pass: remove them (shrink-only). */
  readonly resolved: readonly string[];
}

export function compareToBaseline(
  current: Readonly<Record<string, readonly string[]>>,
  baseline: SeoCertifyBaseline,
  sweptPaths: readonly string[]
): BaselineComparison {
  const regressions: string[] = [];
  const resolved: string[] = [];
  for (const [path, keys] of Object.entries(current)) {
    const accepted = new Set(baseline.failures[path] ?? []);
    for (const key of keys)
      if (!accepted.has(key)) regressions.push(`${path} ${key}`);
  }
  const swept = new Set(sweptPaths);
  for (const [path, keys] of Object.entries(baseline.failures)) {
    // A route the sweep no longer renders cannot prove its debt is fixed.
    if (!swept.has(path)) {
      resolved.push(...keys.map(key => `${path} ${key}`));
      continue;
    }
    const failing = new Set(current[path] ?? []);
    for (const key of keys)
      if (!failing.has(key)) resolved.push(`${path} ${key}`);
  }
  return { regressions, resolved };
}

/** Drops resolved entries; never adds one. */
export function shrinkBaseline(
  baseline: SeoCertifyBaseline,
  current: Readonly<Record<string, readonly string[]>>
): SeoCertifyBaseline {
  const failures: Record<string, string[]> = {};
  for (const [path, keys] of Object.entries(baseline.failures)) {
    const failing = new Set(current[path] ?? []);
    const kept = keys.filter(key => failing.has(key));
    if (kept.length > 0) failures[path] = kept;
  }
  return { schema: SEO_CERTIFY_BASELINE_SCHEMA, failures };
}
