/**
 * Factory page stages (JOV-7276): media decision, ref sourcing, assets,
 * render, SEO/agent readiness, the adversarial trust pass and publish.
 * Publish is always `shadow` until the ramp ships.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { modelFamily } from '@jovie/copy';
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
import { generateMarketingImage } from '../marketing-media/generate-image';
import { sidecarPathFor } from '../marketing-media/provenance';
import { captureBytesDigest, verifyRenderBytes } from './capture-integrity';
import { materializeGeneratedFactoryMedia } from './generated-media';
import { buildFactoryPageRecord } from './page-record';
import { digestOf, writeImmutableJson } from './receipts';
import { evaluateRenderCaptures } from './render-measurer';
import {
  artifactOf,
  Checks,
  type Evaluator,
  judge,
  result,
  type StageContext,
  type StageResult,
  type StageRunner,
  sectionIdsOf,
} from './stage-kit';
import { auditVisualAdmission, buildVisualGateReceipts } from './visual-review';

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

/** File-safe id for a generated asset (`generate:hero-1` -> `generate-hero-1`). */
const assetIdFor = (refId: string) => refId.replaceAll(/[^\w-]/g, '-');

async function assetStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const assets: FactoryStageArtifact<'asset'>['assets'] = [];
  const provenance: Record<string, string> = {};
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
    if (ref.id.startsWith('photo:')) {
      checks.check(
        `asset-provenance:${ref.id}`,
        false,
        'rights-cleared photo import is not wired'
      );
      continue;
    }
    const generated = await generateMarketingImage({
      request: {
        prompt: [
          `${ctx.brief.icp}: ${ref.sectionInstanceId}`,
          ...ctx.feedback.filter(line =>
            line.startsWith(`asset-art:${ref.id}`)
          ),
        ].join('\n'),
        recipeId: ref.source as never,
        characterId: null,
        width: 1600,
        height: 1000,
        brief: ctx.brief.brief.businessObjective,
      },
      adapter: {
        provider: 'factory',
        model: 'factory',
        family: ctx.providers.imageFamily,
        generate: request => ctx.providers.generateAsset(request),
      },
      assetId: assetIdFor(ref.id),
      outDir: (() => {
        const root = join(ctx.runDir, 'assets');
        mkdirSync(root, { recursive: true });
        return mkdtempSync(
          join(root, `iteration-${ctx.iteration ?? 0}-attempt-${ctx.attempt}-`)
        );
      })(),
      artGate: ctx.providers.artGate,
      now: () => ctx.providers.now(),
    });
    if (!('assetPath' in generated)) {
      if (generated.status === 'credentials-unavailable') {
        return result(
          checks,
          { pageId: ctx.pageId, assets },
          { unavailable: generated.reason }
        );
      }
      checks.check(`asset-generation:${ref.id}`, false, generated.reason);
      continue;
    }
    // Provenance (sidecar, C2PA when c2patool exists) is always written; the
    // asset ships only when a cross-family art judge passes it.
    if (
      !checks.check(
        `asset-art:${ref.id}`,
        generated.status === 'generated',
        generated.sidecar.artEvaluation?.notes.join('; ') ?? 'art judge failed'
      )
    ) {
      provenance[ref.id] = relative(ctx.runDir, generated.sidecarPath);
      continue;
    }
    // Bind the byte hash into the receipt's path as well as the provenance.
    // Keep the provider output and every prior attempt intact.
    const assetPath = join(
      dirname(generated.assetPath),
      `${assetIdFor(ref.id)}.${generated.sidecar.sha256}.png`
    );
    copyFileSync(generated.assetPath, assetPath);
    const sidecarPath = sidecarPathFor(assetPath);
    writeImmutableJson(sidecarPath, { ...generated.sidecar, assetPath });
    provenance[ref.id] = relative(ctx.runDir, sidecarPath);
    assets.push({
      id: ref.id,
      refIds: [ref.id],
      path: relative(ctx.runDir, assetPath),
      mime: generated.mime,
      bytes: statSync(generated.assetPath).size,
      width: generated.width,
      height: generated.height,
      c2paManifestDigest:
        generated.sidecar.c2pa.status === 'embedded'
          ? `sha256:${generated.sidecar.sha256}`
          : null,
    });
  }
  return result(
    checks,
    { pageId: ctx.pageId, assets },
    { notes: { provenance } }
  );
}

async function renderStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const { record, issues } = buildFactoryPageRecord(ctx, null);
  checks.check('page-record-schema', issues.length === 0, issues.join('; '));
  if (issues.length > 0) {
    return result(checks, null, { notes: { record } });
  }
  // No asset passes unrendered: each must reach the record the page renders.
  const carried = new Set(
    Object.values(
      (record as { media?: Record<string, { kind: string; id: string }> })
        .media ?? {}
    )
      .filter(media => media.kind === 'screenshot-registry')
      .map(media => `capture:${media.id}`)
  );
  for (const [instance, media] of Object.entries(
    (record as { media?: Record<string, { kind: string }> }).media ?? {}
  )) {
    if (media.kind !== 'generated') continue;
    for (const ref of artifactOf(ctx, 'ref-sourcing').refs) {
      if (
        ref.sectionInstanceId === instance &&
        ref.id.startsWith('generate:')
      ) {
        carried.add(ref.id);
      }
    }
  }
  for (const asset of artifactOf(ctx, 'asset').assets) {
    checks.check(
      `render-asset:${asset.id}`,
      carried.has(asset.id),
      'the page record has no media field for this asset, so the page cannot render it'
    );
  }
  if (checks.failed.length > 0) {
    return result(checks, null, { notes: { record } });
  }
  const mediaIssues = await materializeGeneratedFactoryMedia(ctx);
  checks.check(
    'render-generated-media',
    mediaIssues.length === 0,
    mediaIssues.join('; ')
  );
  if (checks.failed.length > 0) {
    return result(checks, null, { notes: { record } });
  }
  // The candidate the local build previews (FACTORY_PREVIEW_RECORD).
  const renderDir = join(ctx.runDir, 'render');
  mkdirSync(renderDir, { recursive: true });
  const attemptDir = mkdtempSync(
    join(renderDir, `iteration-${ctx.iteration ?? 0}-attempt-${ctx.attempt}-`)
  );
  const previewDir = join(attemptDir, 'preview-records');
  const recordId = `${ctx.brief.family}.${ctx.brief.slug}`;
  const previewPath = join(
    previewDir,
    recordId.replace('.', '-'),
    'page-record.json'
  );
  writeImmutableJson(previewPath, record);
  const preview = {
    path: previewPath,
    digest: captureBytesDigest(readFileSync(previewPath)),
  };
  const measured = await ctx.providers.measureRender(ctx.brief.route, {
    outDir: attemptDir,
    preview: { recordId, runsDir: previewDir },
  });
  if (measured.status !== 'ok') {
    return result(checks, null, {
      unavailable: measured.reason,
      notes: { record },
    });
  }
  for (const check of evaluateRenderCaptures(measured.captures)) {
    checks.check(check.id, check.ok, check.message);
  }
  return result(
    checks,
    {
      pageId: ctx.pageId,
      route: ctx.brief.route,
      cls: measured.cls,
      lcpMs: measured.lcpMs,
      captures: measured.captures,
      preview,
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

/** What a visual finding is about; each dimension has one owning stage. */
export type VisualDimension = 'copy' | 'imagery' | 'layout';

/**
 * The stage each dimension reworks. Copy and assets are generative and take
 * the findings as feedback; layout is a deterministic resolver of the brief,
 * so a layout rework that renders the same page fails `no new render`
 * instead of looping.
 */
export const VISUAL_DIMENSION_STAGE: Readonly<
  Record<VisualDimension, FactoryStage>
> = { copy: 'copy', imagery: 'asset', layout: 'layout' };

const DIMENSION_CUES: readonly [VisualDimension, RegExp][] = [
  // An explicit `[dimension]` tag from the judge wins.
  ['copy', /^\[copy\]/iu],
  ['imagery', /^\[imagery\]|^ref-copy:/iu],
  ['layout', /^\[layout\]/iu],
  [
    'imagery',
    /\b(?:image|imagery|photo|illustration|artwork|picture|graphic|stock|asset|background art)\b/iu,
  ],
  [
    'copy',
    /\b(?:headline|subhead|copy|text|wording|word|line break|wraps?|orphan|truncat\w*|clipped text|typo)\b/iu,
  ],
  [
    'layout',
    /\b(?:layout|alignment|aligned|spacing|whitespace|grid|hierarchy|focal|competing|composition|section order|density|crowded)\b/iu,
  ],
];

/** Tags a finding by its first matching cue; untagged findings are copy. */
export function visualDimensionOf(finding: string): VisualDimension {
  const text = finding.replace(/^[\w-]+@\d+:\s*/u, '');
  return DIMENSION_CUES.find(([, cue]) => cue.test(text))?.[0] ?? 'copy';
}

/**
 * The rework for a rejection: the earliest stage owning any finding's
 * dimension, so one rewind covers them all, with each finding tagged.
 */
export function visualRework(findings: readonly string[]): {
  readonly stage: FactoryStage;
  readonly findings: readonly string[];
} {
  const tagged = findings.map(finding => {
    const dimension = visualDimensionOf(finding);
    return {
      dimension,
      text: `[${dimension}] ${finding.replace(/^\[\w+\]\s*/u, '')}`,
    };
  });
  const stages = [
    ...new Set(
      tagged.map(({ dimension }) => VISUAL_DIMENSION_STAGE[dimension])
    ),
  ];
  const stage =
    stages.toSorted(
      (a, b) => FACTORY_STAGES.indexOf(a) - FACTORY_STAGES.indexOf(b)
    )[0] ?? VISUAL_DIMENSION_STAGE.copy;
  return { stage, findings: tagged.map(({ text }) => text) };
}

/**
 * Visual taste admission: cross-family vision review of the render stage's
 * screenshots, bound to the candidate record's digest, then the visual
 * gates of auditMarketingTasteAdmission.
 */
async function visualAdmission(
  ctx: StageContext,
  checks: Checks,
  producerModel: string
) {
  const captures = artifactOf(ctx, 'render').captures ?? [];
  // The record the render stage measured, before the trust score lands.
  const candidateDigest = digestOf(buildFactoryPageRecord(ctx, null).record);
  const review = await ctx.providers.reviewVisual({
    pageId: ctx.pageId,
    captures,
    producerModel,
  });
  const receipts = buildVisualGateReceipts({
    candidateDigest,
    captures,
    review,
    producerModel,
  });
  if (review.status !== 'reviewed') {
    return {
      evaluators: [],
      receipts,
      unavailable: review.reason,
      rejection: null,
    };
  }
  const admission = auditVisualAdmission({
    candidateDigest,
    generatorModelId: producerModel,
    receipts,
  });
  checks.check(
    'visual-taste-admission',
    admission.length === 0,
    admission.map(finding => finding.message).join('; ')
  );
  const judgeModel = review.judgeModel.replace(/^fixture:/u, '');
  const evaluators: Evaluator[] = [
    {
      id: ctx.providers.label(judgeModel),
      family: modelFamily(judgeModel),
      kind: 'vision',
      verdict: review.verdict,
      score: review.score,
      rubricVersion: 'factory-visual-review/1',
    },
  ];
  // A judge that rejected the page itself, not a seating problem a rework
  // cannot change.
  const rejected =
    review.verdict === 'fail' &&
    !review.findings.some(finding => finding.startsWith('same-family-judge:'));
  return {
    evaluators,
    receipts,
    unavailable: null,
    rejection: rejected ? review.findings : null,
  };
}

async function trustStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const integrity = verifyRenderBytes(
    artifactOf(ctx, 'render'),
    ctx.providers.mode
  );
  if (
    !checks.check(
      'capture-integrity',
      integrity.length === 0,
      integrity.join('; ')
    )
  ) {
    return result(checks, null);
  }
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
  const visual = await visualAdmission(ctx, checks, copyProducer ?? '');
  const evaluators = [...verdict.evaluators, ...visual.evaluators];
  const scores = evaluators.map(e => e.score);
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
      evaluators,
      feedback: [...checks.feedback, ...verdict.critique],
      unavailable:
        [verdict.unavailable, visual.unavailable].filter(Boolean).join('; ') ||
        null,
      notes: { tasteReceipts: visual.receipts },
      rework: visual.rejection ? visualRework(visual.rejection) : null,
    }
  );
}

async function publishStage(ctx: StageContext): Promise<StageResult> {
  const checks = new Checks();
  const { record, issues } = buildFactoryPageRecord(
    ctx,
    artifactOf(ctx, 'adversarial-trust').score
  );
  checks.check('page-record-schema', issues.length === 0, issues.join('; '));
  checks.check(
    'ramp-shadow-only',
    (record as { status?: string }).status === 'shadow',
    'publish only writes shadow records until the ramp ships'
  );
  if (checks.failed.length === 0) {
    // A resumed publication may run after the public preview export was
    // cleaned. Revalidate and restore the admitted bytes before writing URLs.
    const mediaIssues = await materializeGeneratedFactoryMedia(ctx);
    checks.check(
      'publish-generated-media',
      mediaIssues.length === 0,
      mediaIssues.join('; ')
    );
  }
  return result(
    checks,
    { pageId: ctx.pageId, rampState: 'shadow', batchId: null },
    { notes: { record } }
  );
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
