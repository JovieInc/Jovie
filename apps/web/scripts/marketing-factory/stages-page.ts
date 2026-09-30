/**
 * Factory page stages (JOV-7276): media decision, ref sourcing, assets,
 * render, SEO/agent readiness, the adversarial trust pass and publish.
 * Publish is always `shadow` until the ramp ships.
 */

import { existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  decideMedium,
  resolveMediaSourcing,
  toFactoryMediaPlanSection,
} from '../../data/marketing/factory/mediaDecision';
import {
  FACTORY_STAGES,
  type FactoryStage,
  type FactoryStageArtifact,
} from '../../data/marketing/factory/spine';
import { geoFamilyFor } from '../../lib/seo/geo-certification';
import {
  certifySweep,
  SEO_CERTIFY_SITE_ORIGIN,
} from '../../lib/seo/seo-certify-sweep';
import {
  isRegisteredMarketingCapture,
  resolveCapture,
} from '../marketing-media/capture-adapter';
import {
  artifactOf,
  Checks,
  judge,
  result,
  type StageContext,
  type StageResult,
  type StageRunner,
  sectionIdsOf,
} from './stage-kit';

function mediaDecisions(ctx: StageContext) {
  return ctx.brief.media.map(entry => ({
    ...entry,
    decision: decideMedium(entry.input),
  }));
}

async function mediaStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const sections = sectionIdsOf(ctx);
  const decisions = mediaDecisions(ctx);
  checks.check(
    'media-sections-resolve',
    decisions.every(entry => sections.has(entry.sectionInstanceId)),
    'media decisions must target narrative sections'
  );
  return result(checks, {
    pageId: ctx.pageId,
    sections: decisions.map(entry =>
      toFactoryMediaPlanSection(entry.sectionInstanceId, entry.decision)
    ),
  });
}

async function refStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const refs: FactoryStageArtifact<'ref-sourcing'>['refs'] = [];
  const captureRequests: unknown[] = [];
  for (const entry of mediaDecisions(ctx)) {
    const sourcing = resolveMediaSourcing(
      entry.decision,
      entry.input.evidence,
      {
        isRegisteredCapture: id => isRegisteredMarketingCapture(id),
        // Fail closed until a certified Pen ref registry exists.
        isCertifiedPenRef: () => false,
      }
    );
    const sectionInstanceId = entry.sectionInstanceId;
    switch (sourcing.kind) {
      case 'text-native':
        break;
      case 'registry-capture':
        refs.push({
          id: `capture:${sourcing.scenarioId}`,
          sectionInstanceId,
          source: 'screenshot-registry',
          provenance: 'apps/web/lib/screenshots/registry.ts',
          license: 'owned',
        });
        break;
      case 'capture-request':
        captureRequests.push(
          resolveCapture({ pageId: ctx.pageId, sectionInstanceId, sourcing })
        );
        break;
      case 'rights-cleared-photo':
        refs.push({
          id: `photo:${sourcing.photoId}`,
          sectionInstanceId,
          source: 'photo',
          provenance: sourcing.credit,
          license: sourcing.rights,
        });
        break;
      case 'pen-ref':
      case 'generation':
        refs.push({
          id: `generate:${sectionInstanceId}`,
          sectionInstanceId,
          source:
            sourcing.kind === 'pen-ref' ? sourcing.penRef : sourcing.recipeId,
          provenance: 'factory generation request',
          license: 'owned-generated',
        });
        break;
    }
  }
  checks.check('refs-provenance', true);
  return result(
    checks,
    { pageId: ctx.pageId, refs },
    { notes: { captureRequests } }
  );
}

const PUBLIC_DIR = join(import.meta.dirname, '../../public');
const MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

async function assetStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const assets: FactoryStageArtifact<'asset'>['assets'] = [];
  for (const ref of artifactOf(ctx, 'ref-sourcing').refs) {
    if (ref.id.startsWith('capture:')) {
      const scenarioId = ref.id.slice('capture:'.length);
      const capture = resolveCapture({
        pageId: ctx.pageId,
        sectionInstanceId: ref.sectionInstanceId,
        sourcing: { kind: 'registry-capture', scenarioId },
      });
      const file =
        capture.status === 'resolved'
          ? join(PUBLIC_DIR, capture.image.publicUrl.split('?')[0] ?? '')
          : null;
      if (
        !checks.check(
          `asset-file:${ref.id}`,
          Boolean(file && existsSync(file)),
          'capture export is missing on disk'
        )
      ) {
        continue;
      }
      if (!file || capture.status !== 'resolved') continue;
      assets.push({
        id: ref.id,
        refIds: [ref.id],
        path: capture.image.publicUrl,
        mime: MIME[extname(file)] ?? 'application/octet-stream',
        bytes: statSync(file).size,
        width: capture.image.width,
        height: capture.image.height,
        c2paManifestDigest: null,
      });
      continue;
    }
    const outcome = await ctx.providers.generateAsset({
      prompt: `${ctx.brief.icp}: ${ref.sectionInstanceId}`,
      recipeId: ref.source as never,
      characterId: null,
      width: 1600,
      height: 1000,
      brief: ctx.brief.brief.businessObjective,
    });
    if (outcome.status === 'credentials-unavailable') {
      return result(
        checks,
        { pageId: ctx.pageId, assets },
        { unavailable: outcome.reason }
      );
    }
    // Generated and photo assets ship only with a provenance sidecar and an
    // art-evaluator record, which factory:run does not produce yet.
    checks.check(
      `asset-provenance:${ref.id}`,
      false,
      'provenance + art-evaluator path is not wired'
    );
  }
  return result(checks, { pageId: ctx.pageId, assets });
}

/** Minimal local page record; reconciled with JOV-7275 pageRecord.ts. */
export function buildPageRecord(ctx: StageContext) {
  const copy = artifactOf(ctx, 'copy');
  return {
    schema: 'jovie.factory-page-record/v0',
    pageId: ctx.pageId,
    family: ctx.brief.family,
    slug: ctx.brief.slug,
    route: ctx.brief.route,
    status: 'shadow' as const,
    claimIds: artifactOf(ctx, 'truth').claims.map(claim => claim.id),
    composition: artifactOf(ctx, 'layout'),
    hero: artifactOf(ctx, 'hero-variant'),
    copy: copy.slots,
    proof: artifactOf(ctx, 'proof'),
    sectionRequests: artifactOf(ctx, 'gap-detection').sectionRequests,
    media: artifactOf(ctx, 'media-decision').sections,
    assets: artifactOf(ctx, 'asset').assets,
  };
}

async function renderStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const record = buildPageRecord(ctx);
  const measured = await ctx.providers.measureRender(ctx.brief.route);
  if (measured.status !== 'ok') {
    return result(checks, null, {
      unavailable: measured.reason,
      notes: { record },
    });
  }
  checks.check(
    'render-cls',
    measured.cls <= 0.05,
    `CLS ${measured.cls} > 0.05`
  );
  checks.check(
    'render-lcp',
    measured.lcpMs < 2500,
    `LCP ${measured.lcpMs}ms >= 2500ms`
  );
  return result(
    checks,
    {
      pageId: ctx.pageId,
      route: ctx.brief.route,
      cls: measured.cls,
      lcpMs: measured.lcpMs,
    },
    { notes: { record } }
  );
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`);

/** Static preview of the record's head and body, the input to the SEO sweep. */
export function renderRecordPreview(ctx: StageContext): string {
  const slots = artifactOf(ctx, 'copy').slots;
  const hero = slots.filter(
    slot => slot.sectionInstanceId === slots[0]?.sectionInstanceId
  );
  const title = hero.find(slot => slot.slot === 'headline')?.text ?? ctx.pageId;
  const description = hero.find(slot => slot.slot === 'subhead')?.text ?? '';
  const url = new URL(ctx.brief.route, SEO_CERTIFY_SITE_ORIGIN).toString();
  const asset = artifactOf(ctx, 'asset').assets[0];
  const image = asset
    ? new URL(asset.path, SEO_CERTIFY_SITE_ORIGIN).toString()
    : null;
  const jsonLd = ctx.brief.seo.jsonLdTypes.map(type => ({
    '@context': 'https://schema.org',
    '@type': type,
    name: title,
    url,
  }));
  return [
    `<!doctype html><html lang="en"><head><title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    ...(image ? [`<meta property="og:image" content="${image}">`] : []),
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
    '</head><body><main>',
    `<h1>${escapeHtml(title)}</h1>`,
    ...slots
      .filter(slot => !(hero.includes(slot) && slot.slot === 'headline'))
      .map(slot => `<p>${escapeHtml(slot.text)}</p>`),
    '<p>',
    ...ctx.brief.seo.siblingLinks.map(href => `<a href="${href}">${href}</a>`),
    '</p></main></body></html>',
  ].join('\n');
}

/** Checks the ramp enforces before indexing, not before a shadow record. */
const RAMP_DEFERRED_CHECKS = new Set(['geo:geo-orphan']);

async function seoStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const route = ctx.brief.route;
  const recipeId = artifactOf(ctx, 'layout').recipeId;
  const [swept] = certifySweep({
    pages: [
      {
        target: {
          pathname: route,
          manifestUrl: route,
          recipeId,
          inSitemap: true,
          family: geoFamilyFor(route, recipeId),
        },
        html: renderRecordPreview(ctx),
        status: 200,
        source: 'factory:page-record-preview',
      },
    ],
    sourceSha: null,
    runRef: ctx.pageId,
    now: ctx.providers.now(),
    llmsTxt: null,
  });
  if (!swept) return result(checks, null);
  const deferred: string[] = [];
  for (const check of swept.certification.checks) {
    const id = `${check.dimension}:${check.id}`;
    if (check.status === 'failed' && RAMP_DEFERRED_CHECKS.has(id)) {
      deferred.push(id);
      continue;
    }
    checks.check(
      id,
      check.status !== 'failed',
      check.remediation ?? check.summary
    );
  }
  checks.check(
    'seo-artifact-schema',
    swept.artifact.schemaIssues.length === 0,
    swept.artifact.schemaIssues.join('; ')
  );
  return result(
    checks,
    { ...(swept.artifact.value as object), pageId: ctx.pageId },
    {
      // The sweep's own evaluator, re-scored without the ramp-deferred checks.
      evaluators: swept.stageReceipt.evaluators.map(evaluator => ({
        ...evaluator,
        verdict: checks.failed.length === 0 ? 'pass' : 'fail',
        score:
          checks.passed.length / (checks.passed.length + checks.failed.length),
      })),
      notes: { deferredToRamp: deferred },
    }
  );
}

async function trustStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const upstream = FACTORY_STAGES.slice(
    0,
    FACTORY_STAGES.indexOf('adversarial-trust')
  );
  checks.check(
    'receipts-present',
    upstream.every(stage => ctx.receipts[stage]?.passed === true),
    'every upstream stage needs a harness-passed receipt'
  );
  const copyProducer = ctx.receipts.copy?.producer?.modelId.replace(
    /^fixture:/,
    ''
  );
  const verdict = await judge(ctx, {
    rubric: 'red-team',
    tier: 'flagship',
    producerModel: copyProducer,
    instruction:
      'Find any sentence the CLAIMS do not support. List each in unsupportedClaims.',
    subject: {
      claims: artifactOf(ctx, 'truth').claims,
      copy: artifactOf(ctx, 'copy').slots,
      proof: artifactOf(ctx, 'proof'),
    },
  });
  const families = new Set(verdict.evaluators.map(e => e.family));
  if (!verdict.unavailable) {
    checks.check(
      'red-team-two-families',
      families.size >= 2,
      'the red team needs two model families'
    );
    checks.check(
      'no-unsupported-claims',
      verdict.unsupportedClaims.length === 0,
      verdict.unsupportedClaims.join('; ')
    );
  }
  const scores = verdict.evaluators.map(e => e.score);
  return result(
    checks,
    {
      pageId: ctx.pageId,
      score: scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0,
      unsupportedClaims: verdict.unsupportedClaims,
    },
    {
      evaluators: verdict.evaluators,
      feedback: [...checks.feedback, ...verdict.critique],
      unavailable: verdict.unavailable,
    }
  );
}

async function publishStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  checks.check('ramp-shadow-only', true);
  return result(checks, {
    pageId: ctx.pageId,
    rampState: 'shadow',
    batchId: null,
  });
}

export const PAGE_STAGE_RUNNERS = {
  'media-decision': mediaStage,
  'ref-sourcing': refStage,
  asset: assetStage,
  render: renderStage,
  'seo-agent': seoStage,
  'adversarial-trust': trustStage,
  publish: publishStage,
} as const satisfies Partial<Record<FactoryStage, StageRunner>>;
