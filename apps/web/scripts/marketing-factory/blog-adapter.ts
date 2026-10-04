/**
 * Blog-family adapter for the Marketing Page Factory (JOV-7397).
 *
 * The article body remains Markdown in content/blog. This record contains
 * only references, digests, evidence receipts and qualification output. It
 * does not mint PASS: certifyBlogFactoryRecord verifies harness-owned factory
 * receipts against the exact candidate before returning a verdict.
 */

import { RUBRIC_VERSION } from '@jovie/copy';
import { z } from 'zod';
import {
  FACTORY_STAGES,
  FactoryRenderCaptureSchema,
  type FactoryStage,
  StageReceiptSchema,
  validateStageReceipt,
} from '../../data/marketing/factory/spine';
import { listProductTruthClaims } from '../../data/product-truth/claims';
import { digestOf, stageInputDigest } from './receipts';
import { RENDER_BUDGETS } from './render-measurer';

export const BLOG_FACTORY_RECORD_SCHEMA = 'jovie.blog-factory-record/v1';
export const BLOG_FACTORY_POLICY_VERSION = 'blog-certification/1';
export const BLOG_COPY_EVALUATOR_VERSION = RUBRIC_VERSION;
export const BLOG_EDITORIAL_EVALUATOR_VERSION = 'factory-red-team/1';
export const BLOG_VISUAL_EVALUATOR_VERSION = 'factory-visual-review/1';
export const BLOG_PUBLICATION_RECEIPT_SCHEMA =
  'jovie.blog-publication-receipt/v1';

const Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const Revision = z.string().regex(/^[a-f0-9]{40}$/u);
const FactoryStages = z.enum(FACTORY_STAGES);

const BlogCandidateSchema = z.strictObject({
  articleId: z.string().regex(/^blog\.[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  slug: Slug,
  sourcePath: z.string().regex(/^content\/blog\/[a-z0-9-]+\.md$/u),
  contentDigest: Digest,
  metadataDigest: Digest,
  assets: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        digest: Digest,
        alt: z.string().trim().min(1),
      })
    )
    .default([]),
  rendererRevision: Revision,
  sourceRevision: Revision,
  candidateBuild: z.string().min(1),
  eligibilityReceiptDigest: Digest,
  policyVersion: z.literal(BLOG_FACTORY_POLICY_VERSION),
  evaluatorVersions: z.strictObject({
    copy: z.literal(BLOG_COPY_EVALUATOR_VERSION),
    editorial: z.literal(BLOG_EDITORIAL_EVALUATOR_VERSION),
    visual: z.literal(BLOG_VISUAL_EVALUATOR_VERSION),
  }),
  asOf: z.iso.datetime(),
});

export type BlogCandidate = z.infer<typeof BlogCandidateSchema>;

const BlogClaimEvidenceSchema = z
  .strictObject({
    claimId: z.string().min(1),
    kind: z.enum(['product-truth', 'external']),
    sourceRef: z.string().min(1),
    sourceDigest: Digest,
    checkedAt: z.iso.datetime(),
    validUntil: z.iso.datetime().nullable(),
    sensitivity: z
      .enum([
        'ordinary',
        'founder-experience',
        'quote',
        'customer',
        'metric',
        'author-attribution',
      ])
      .default('ordinary'),
    authorizationRef: z.string().min(1).nullable().default(null),
  })
  .superRefine((evidence, ctx) => {
    if (
      evidence.sensitivity !== 'ordinary' &&
      evidence.authorizationRef === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['authorizationRef'],
        message: `${evidence.sensitivity} claims need an authorization receipt`,
      });
    }
    if (evidence.kind === 'external' && evidence.validUntil === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['validUntil'],
        message: 'external evidence needs an explicit validity window',
      });
    }
  });

export type BlogClaimEvidence = z.infer<typeof BlogClaimEvidenceSchema>;

const BlogContentChecksSchema = z.strictObject({
  candidateDigest: Digest,
  materialClaimIds: z.array(z.string().min(1)),
  metadataValid: z.boolean(),
  authorAttributionValid: z.boolean(),
  safeMarkdown: z.boolean(),
  linksValid: z.boolean(),
  richBlocksAllowlisted: z.boolean(),
  copyLintPassed: z.boolean(),
});

const BLOG_RENDER_CHECK_IDS = [
  'reading-hierarchy',
  'internal-links',
  'external-links',
  'accessibility',
  'overflow',
  'artwork-fallback',
  'canonical-metadata',
  'seo-metadata',
  'share-preview',
  'performance-budget',
] as const;

const BlogRenderCaptureSchema = FactoryRenderCaptureSchema.extend({
  outputId: z.string().min(1),
  kind: z.enum(['article', 'discovery', 'share']),
  pathname: z.string().startsWith('/'),
  viewport: z.enum(['phone', 'tablet', 'desktop']),
  theme: z.enum(['light', 'dark']),
  checksPassed: z.array(z.enum(BLOG_RENDER_CHECK_IDS)),
  checksFailed: z.array(z.enum(BLOG_RENDER_CHECK_IDS)),
});

const BlogRenderEvidenceSchema = z.strictObject({
  candidateDigest: Digest,
  captures: z.array(BlogRenderCaptureSchema).min(1),
  missingArtworkFallbackTested: z.boolean(),
  poorArtworkFallbackTested: z.boolean(),
});

const BlogSeoEvidenceSchema = z.strictObject({
  candidateDigest: Digest,
  canonicalUrl: z.url(),
  metadataDigest: Digest,
  shareDigest: Digest,
  canonicalPassed: z.boolean(),
  structuredDataPassed: z.boolean(),
  indexingPolicyPassed: z.boolean(),
});

const BlogEditorialEvidenceSchema = z.strictObject({
  candidateDigest: Digest,
  freshContext: z.boolean(),
  usefulnessPassed: z.boolean(),
  accuracyPassed: z.boolean(),
  claimSupportPassed: z.boolean(),
  unsupportedClaims: z.array(z.string().min(1)),
});

const BlogPublicationReceiptSchema = z.strictObject({
  schema: z.literal(BLOG_PUBLICATION_RECEIPT_SCHEMA),
  articleId: z.string().min(1),
  candidateDigest: Digest,
  exactRevision: Revision,
  candidateBuild: z.string().min(1),
  url: z.url(),
  eligibilityReceiptDigest: Digest,
  indexingState: z.enum(['noindex', 'indexed']),
  authorization: z.strictObject({
    grantId: z.string().min(1),
    receiptDigest: Digest,
    candidateDigest: Digest,
    allowedIndexingStates: z.array(z.enum(['noindex', 'indexed'])).min(1),
    expiresAt: z.iso.datetime(),
  }),
  publishedAt: z.iso.datetime(),
  deployed: z.strictObject({
    contentDigest: Digest,
    metadataDigest: Digest,
    shareDigest: Digest,
  }),
  liveChecks: z.strictObject({
    checkedAt: z.iso.datetime(),
    httpStatus: z.number().int(),
    pageMatches: z.boolean(),
    metadataMatches: z.boolean(),
    shareMatches: z.boolean(),
    discoveryMatches: z.boolean(),
  }),
  revert: z.strictObject({
    method: z.literal('withdraw'),
    testedAt: z.iso.datetime(),
    passed: z.boolean(),
  }),
  idempotencyKey: Digest,
});

export type BlogPublicationReceipt = z.infer<
  typeof BlogPublicationReceiptSchema
>;

const BlogStageArtifactSchema = z.strictObject({
  schema: z.literal('jovie.blog-stage-artifact/v1'),
  stage: FactoryStages,
  candidateDigest: Digest,
  evidenceDigest: Digest,
});

export type BlogStageArtifact = z.infer<typeof BlogStageArtifactSchema>;

export const BlogFactoryRecordSchema = z
  .strictObject({
    schema: z.literal(BLOG_FACTORY_RECORD_SCHEMA),
    family: z.literal('blog'),
    status: z.enum(['shadow', 'noindex', 'indexed']),
    candidateDigest: Digest,
    candidate: BlogCandidateSchema,
    evidence: z.array(BlogClaimEvidenceSchema),
    contentChecks: BlogContentChecksSchema,
    renderEvidence: BlogRenderEvidenceSchema,
    seoEvidence: BlogSeoEvidenceSchema,
    editorialEvidence: BlogEditorialEvidenceSchema,
    stageArtifacts: z.array(BlogStageArtifactSchema),
    receipts: z.array(StageReceiptSchema),
    publication: BlogPublicationReceiptSchema.nullable(),
  })
  .superRefine((record, ctx) => {
    if (record.candidate.articleId !== `blog.${record.candidate.slug}`) {
      ctx.addIssue({
        code: 'custom',
        path: ['candidate', 'articleId'],
        message: `articleId must be "blog.${record.candidate.slug}"`,
      });
    }
    if (
      record.candidate.sourcePath !== `content/blog/${record.candidate.slug}.md`
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['candidate', 'sourcePath'],
        message: 'sourcePath must reference the canonical Markdown slug',
      });
    }
  });

export type BlogFactoryRecord = z.infer<typeof BlogFactoryRecordSchema>;
export type BlogFactoryRecordInput = z.input<typeof BlogFactoryRecordSchema>;

export interface BlogCertificationIssue {
  readonly code: string;
  readonly message: string;
  readonly stage?: FactoryStage;
}

export interface BlogCertificationResult {
  readonly verdict: 'pass' | 'fail' | 'authorization-required';
  readonly candidateDigest: string | null;
  readonly issues: readonly BlogCertificationIssue[];
}

export interface BlogCertificationContext {
  /** Exact Markdown bytes read by the harness from candidate.sourcePath. */
  readonly sourceContent?: string;
}

function sortedEvidence(evidence: readonly BlogClaimEvidence[]) {
  return evidence.toSorted((left, right) =>
    left.claimId.localeCompare(right.claimId)
  );
}

/** Exact source/metadata/assets/policy/evidence identity for one candidate. */
export function blogCandidateDigest(
  candidate: BlogCandidate,
  evidence: readonly z.input<typeof BlogClaimEvidenceSchema>[]
): string {
  return digestOf({
    candidate: BlogCandidateSchema.parse(candidate),
    evidence: sortedEvidence(
      evidence.map(item => BlogClaimEvidenceSchema.parse(item))
    ),
  });
}

export function blogPublicationIdempotencyKey(input: {
  readonly articleId: string;
  readonly candidateDigest: string;
  readonly exactRevision: string;
  readonly url: string;
  readonly indexingState: 'noindex' | 'indexed';
}): string {
  return digestOf(input);
}

type BlogStageEvidence = Pick<
  BlogFactoryRecord,
  | 'candidateDigest'
  | 'evidence'
  | 'contentChecks'
  | 'renderEvidence'
  | 'seoEvidence'
  | 'editorialEvidence'
  | 'publication'
>;

export function blogStageEvidenceDigest(
  record: BlogStageEvidence,
  stage: FactoryStage
): string {
  switch (stage) {
    case 'truth':
      return digestOf(
        record.evidence.map(item => BlogClaimEvidenceSchema.parse(item))
      );
    case 'copy':
      return digestOf(record.contentChecks);
    case 'render':
      return digestOf(record.renderEvidence);
    case 'seo-agent':
      return digestOf(record.seoEvidence);
    case 'adversarial-trust':
      return digestOf(record.editorialEvidence);
    case 'publish':
      return digestOf(record.publication);
    default:
      return record.candidateDigest;
  }
}

export function defineBlogStageArtifact(
  record: BlogStageEvidence,
  stage: FactoryStage
): BlogStageArtifact {
  return BlogStageArtifactSchema.parse({
    schema: 'jovie.blog-stage-artifact/v1',
    stage,
    candidateDigest: record.candidateDigest,
    evidenceDigest: blogStageEvidenceDigest(record, stage),
  });
}

function addIssue(
  issues: BlogCertificationIssue[],
  code: string,
  message: string,
  stage?: FactoryStage
) {
  issues.push({ code, message, ...(stage ? { stage } : {}) });
}

function validateEvidence(
  record: BlogFactoryRecord,
  issues: BlogCertificationIssue[]
) {
  const claimIds = record.evidence.map(item => item.claimId);
  if (new Set(claimIds).size !== claimIds.length) {
    addIssue(
      issues,
      'duplicate-claim-evidence',
      'claim evidence must be unique'
    );
  }
  const declaredClaims = record.contentChecks.materialClaimIds.toSorted();
  if (JSON.stringify(declaredClaims) !== JSON.stringify(claimIds.toSorted())) {
    addIssue(
      issues,
      'claim-evidence-coverage',
      'every material claim needs exactly one evidence receipt'
    );
  }
  const claims = new Map(
    listProductTruthClaims().map(claim => [claim.id, claim])
  );
  const asOf = Date.parse(record.candidate.asOf);
  for (const evidence of record.evidence) {
    const checkedAt = Date.parse(evidence.checkedAt);
    if (checkedAt > asOf) {
      addIssue(
        issues,
        'evidence-from-future',
        `${evidence.claimId} was checked after the candidate asOf`
      );
    }
    if (
      evidence.validUntil !== null &&
      Date.parse(evidence.validUntil) < asOf
    ) {
      addIssue(
        issues,
        'stale-evidence',
        `${evidence.claimId} evidence expired before certification`
      );
    }
    if (evidence.kind !== 'product-truth') continue;
    const claim = claims.get(evidence.claimId);
    if (!claim) {
      addIssue(
        issues,
        'unsupported-product-claim',
        `${evidence.claimId} is not in the product-truth registry`
      );
      continue;
    }
    if (evidence.sourceDigest !== digestOf(claim)) {
      addIssue(
        issues,
        'changed-product-claim',
        `${evidence.claimId} no longer matches product truth`
      );
    }
  }
}

const REQUIRED_CONTENT_CHECKS: ReadonlyArray<
  keyof Omit<
    BlogFactoryRecord['contentChecks'],
    'candidateDigest' | 'materialClaimIds'
  >
> = [
  'metadataValid',
  'authorAttributionValid',
  'safeMarkdown',
  'linksValid',
  'richBlocksAllowlisted',
  'copyLintPassed',
];

const REQUIRED_ARTICLE_RENDER_CHECKS = BLOG_RENDER_CHECK_IDS.filter(
  check => check !== 'share-preview'
);

// Discovery lists need the shared surface checks; article prose hierarchy
// and article-specific external citations are measured on article captures.
const REQUIRED_DISCOVERY_RENDER_CHECKS = REQUIRED_ARTICLE_RENDER_CHECKS.filter(
  check => check !== 'reading-hierarchy' && check !== 'external-links'
);

function validateQualificationEvidence(
  record: BlogFactoryRecord,
  issues: BlogCertificationIssue[]
) {
  for (const key of REQUIRED_CONTENT_CHECKS) {
    if (!record.contentChecks[key]) {
      addIssue(issues, `content-${key}`, `${key} did not pass`, 'copy');
    }
  }
  const exactCandidateFields = [
    record.contentChecks.candidateDigest,
    record.renderEvidence.candidateDigest,
    record.seoEvidence.candidateDigest,
    record.editorialEvidence.candidateDigest,
  ];
  if (exactCandidateFields.some(digest => digest !== record.candidateDigest)) {
    addIssue(
      issues,
      'stale-qualification-evidence',
      'qualification evidence does not bind the exact candidate'
    );
  }
  const expectedArticlePath = `/blog/${record.candidate.slug}`;
  if (
    record.seoEvidence.metadataDigest !== record.candidate.metadataDigest ||
    new URL(record.seoEvidence.canonicalUrl).pathname !== expectedArticlePath
  ) {
    addIssue(
      issues,
      'seo-candidate-mismatch',
      'canonical URL and metadata must match the exact article candidate',
      'seo-agent'
    );
  }
  const assetIds = record.candidate.assets.map(asset => asset.id);
  if (new Set(assetIds).size !== assetIds.length) {
    addIssue(
      issues,
      'duplicate-asset-id',
      'candidate asset ids must be unique'
    );
  }
  const articleCaptures = record.renderEvidence.captures.filter(
    capture => capture.kind === 'article'
  );
  for (const viewport of ['phone', 'tablet', 'desktop'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      if (
        !articleCaptures.some(
          capture => capture.viewport === viewport && capture.theme === theme
        )
      ) {
        addIssue(
          issues,
          'missing-render-state',
          `article needs ${viewport}/${theme} rendered evidence`,
          'render'
        );
      }
    }
  }
  for (const kind of ['article', 'discovery', 'share'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      if (
        !record.renderEvidence.captures.some(
          capture => capture.kind === kind && capture.theme === theme
        )
      ) {
        addIssue(
          issues,
          'missing-render-output',
          `missing affected ${kind}/${theme} output`,
          'render'
        );
      }
    }
  }
  const outputIds = record.renderEvidence.captures.map(
    capture => capture.outputId
  );
  if (new Set(outputIds).size !== outputIds.length) {
    addIssue(
      issues,
      'duplicate-render-output',
      'render output ids must be unique'
    );
  }
  for (const capture of record.renderEvidence.captures) {
    if (
      capture.kind === 'article' &&
      capture.pathname !== expectedArticlePath
    ) {
      addIssue(
        issues,
        'render-path-mismatch',
        `${capture.outputId} does not render ${expectedArticlePath}`,
        'render'
      );
    }
    if (capture.httpStatus !== 200) {
      addIssue(
        issues,
        'render-http-status',
        `${capture.outputId} returned ${capture.httpStatus}`,
        'render'
      );
    }
    if (
      capture.cls > RENDER_BUDGETS.cls ||
      capture.lcpMs === null ||
      capture.lcpMs >= RENDER_BUDGETS.lcpMs ||
      capture.domFindings.length > 0
    ) {
      addIssue(
        issues,
        'factory-render-evidence-failed',
        `${capture.outputId} failed the shared render measurer`,
        'render'
      );
    }
    if (capture.checksFailed.length > 0) {
      addIssue(
        issues,
        'failed-render-check',
        `${capture.outputId}: ${capture.checksFailed.join(', ')}`,
        'render'
      );
    }
    if (
      capture.checksPassed.some(check => capture.checksFailed.includes(check))
    ) {
      addIssue(
        issues,
        'contradictory-render-check',
        `${capture.outputId} reports a check as both passed and failed`,
        'render'
      );
    }
    const required =
      capture.kind === 'share'
        ? ['accessibility', 'overflow', 'artwork-fallback', 'share-preview']
        : capture.kind === 'discovery'
          ? REQUIRED_DISCOVERY_RENDER_CHECKS
          : REQUIRED_ARTICLE_RENDER_CHECKS;
    const missing = required.filter(
      check =>
        !capture.checksPassed.includes(
          check as (typeof BLOG_RENDER_CHECK_IDS)[number]
        )
    );
    if (missing.length > 0) {
      addIssue(
        issues,
        'incomplete-render-checks',
        `${capture.outputId} lacks ${missing.join(', ')}`,
        'render'
      );
    }
  }
  if (
    !record.renderEvidence.missingArtworkFallbackTested ||
    !record.renderEvidence.poorArtworkFallbackTested
  ) {
    addIssue(
      issues,
      'artwork-fallbacks-untested',
      'missing and poor artwork fallbacks must both be rendered',
      'render'
    );
  }
  if (
    !record.seoEvidence.canonicalPassed ||
    !record.seoEvidence.structuredDataPassed ||
    !record.seoEvidence.indexingPolicyPassed
  ) {
    addIssue(
      issues,
      'seo-check-failed',
      'SEO certification did not pass',
      'seo-agent'
    );
  }
  if (
    !record.editorialEvidence.freshContext ||
    !record.editorialEvidence.usefulnessPassed ||
    !record.editorialEvidence.accuracyPassed ||
    !record.editorialEvidence.claimSupportPassed ||
    record.editorialEvidence.unsupportedClaims.length > 0
  ) {
    addIssue(
      issues,
      'editorial-evaluation-failed',
      'fresh-context usefulness, accuracy and claim support must pass',
      'adversarial-trust'
    );
  }
}

function validateReceiptChain(
  record: BlogFactoryRecord,
  issues: BlogCertificationIssue[]
) {
  const artifacts = new Map<FactoryStage, BlogStageArtifact>();
  const receipts = new Map<
    FactoryStage,
    BlogFactoryRecord['receipts'][number]
  >();
  for (const artifact of record.stageArtifacts) {
    if (artifacts.has(artifact.stage)) {
      addIssue(
        issues,
        'duplicate-stage-artifact',
        artifact.stage,
        artifact.stage
      );
    }
    artifacts.set(artifact.stage, artifact);
  }
  for (const receipt of record.receipts) {
    if (receipts.has(receipt.stage)) {
      addIssue(issues, 'duplicate-stage-receipt', receipt.stage, receipt.stage);
    }
    receipts.set(receipt.stage, receipt);
  }

  const requiredStages = record.publication
    ? FACTORY_STAGES
    : FACTORY_STAGES.slice(0, -1);
  for (const stage of FACTORY_STAGES) {
    if (
      !requiredStages.includes(stage) &&
      (artifacts.has(stage) || receipts.has(stage))
    ) {
      addIssue(
        issues,
        'unexpected-stage-evidence',
        `${stage} exists without a publication receipt`,
        stage
      );
    }
  }
  const priorOutputs: string[] = [];
  for (const stage of requiredStages) {
    const artifact = artifacts.get(stage);
    const receipt = receipts.get(stage);
    if (!artifact || !receipt) {
      addIssue(issues, 'missing-stage-evidence', `${stage} is missing`, stage);
      continue;
    }
    if (artifact.candidateDigest !== record.candidateDigest) {
      addIssue(issues, 'stale-stage-artifact', stage, stage);
    }
    if (artifact.evidenceDigest !== blogStageEvidenceDigest(record, stage)) {
      addIssue(issues, 'stale-stage-evidence', stage, stage);
    }
    for (const problem of validateStageReceipt(receipt)) {
      addIssue(issues, 'invalid-stage-receipt', problem, stage);
    }
    if (receipt.pageId !== record.candidate.articleId) {
      addIssue(issues, 'receipt-article-mismatch', receipt.pageId, stage);
    }
    if (!receipt.passed) {
      addIssue(issues, 'stage-not-passed', stage, stage);
    }
    if (receipt.outputDigest !== digestOf(artifact)) {
      addIssue(issues, 'forged-output-digest', stage, stage);
    }
    if (
      receipt.inputDigest !==
      stageInputDigest(record.candidateDigest, priorOutputs)
    ) {
      addIssue(issues, 'stale-input-digest', stage, stage);
    }
    priorOutputs.push(receipt.outputDigest);
  }

  const copy = receipts.get('copy');
  if (
    !copy?.evaluators.some(
      evaluator =>
        evaluator.kind === 'llm' &&
        evaluator.rubricVersion === record.candidate.evaluatorVersions.copy
    )
  ) {
    addIssue(
      issues,
      'copy-evaluator-missing',
      'copy needs the bound independent evaluator version',
      'copy'
    );
  }
  const trust = receipts.get('adversarial-trust');
  if (
    !trust?.evaluators.some(
      evaluator =>
        evaluator.kind === 'llm' &&
        evaluator.rubricVersion === record.candidate.evaluatorVersions.editorial
    ) ||
    !trust?.evaluators.some(
      evaluator =>
        evaluator.kind === 'vision' &&
        evaluator.rubricVersion === record.candidate.evaluatorVersions.visual
    )
  ) {
    addIssue(
      issues,
      'trust-evaluators-missing',
      'trust needs the bound editorial and visual evaluators',
      'adversarial-trust'
    );
  }
}

function validatePublication(
  record: BlogFactoryRecord,
  issues: BlogCertificationIssue[]
) {
  const publication = record.publication;
  if (!publication) return;
  const candidate = record.candidate;
  const expectedKey = blogPublicationIdempotencyKey({
    articleId: candidate.articleId,
    candidateDigest: record.candidateDigest,
    exactRevision: candidate.sourceRevision,
    url: publication.url,
    indexingState: publication.indexingState,
  });
  const expectedPath = `/blog/${candidate.slug}`;
  const mismatched =
    publication.articleId !== candidate.articleId ||
    publication.candidateDigest !== record.candidateDigest ||
    publication.exactRevision !== candidate.sourceRevision ||
    publication.candidateBuild !== candidate.candidateBuild ||
    publication.eligibilityReceiptDigest !==
      candidate.eligibilityReceiptDigest ||
    publication.authorization.candidateDigest !== record.candidateDigest ||
    !publication.authorization.allowedIndexingStates.includes(
      publication.indexingState
    ) ||
    publication.deployed.contentDigest !== candidate.contentDigest ||
    publication.deployed.metadataDigest !== candidate.metadataDigest ||
    publication.deployed.metadataDigest !== record.seoEvidence.metadataDigest ||
    publication.deployed.shareDigest !== record.seoEvidence.shareDigest ||
    new URL(publication.url).pathname !== expectedPath ||
    publication.idempotencyKey !== expectedKey ||
    publication.indexingState !== record.status;
  if (mismatched) {
    addIssue(
      issues,
      'publication-candidate-mismatch',
      'publication does not match the exact authorized candidate',
      'publish'
    );
  }
  if (
    Date.parse(publication.authorization.expiresAt) <
    Date.parse(publication.liveChecks.checkedAt)
  ) {
    addIssue(
      issues,
      'publication-authorization-expired',
      'authorization expired before live verification',
      'publish'
    );
  }
  if (
    Date.parse(publication.liveChecks.checkedAt) <
    Date.parse(publication.publishedAt)
  ) {
    addIssue(
      issues,
      'live-verification-too-early',
      'live verification must happen after publication',
      'publish'
    );
  }
  if (publication.liveChecks.httpStatus !== 200) {
    addIssue(
      issues,
      'live-http-status',
      `live page returned ${publication.liveChecks.httpStatus}`,
      'publish'
    );
  }
  if (Object.values(publication.liveChecks).some(value => value === false)) {
    addIssue(
      issues,
      'live-verification-failed',
      'page, metadata, discovery and share outputs must match live',
      'publish'
    );
  }
  if (!publication.revert.passed) {
    addIssue(
      issues,
      'revert-path-untested',
      'withdraw must be tested before publication can pass',
      'publish'
    );
  }
}

/**
 * The factory harness decision for one exact article candidate. The authoring
 * agent cannot place a verdict in the record; changing any bound input makes
 * the receipt chain stale and forces bounded recertification.
 */
export function certifyBlogFactoryRecord(
  input: unknown,
  context: BlogCertificationContext = {}
): BlogCertificationResult {
  const parsed = BlogFactoryRecordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      verdict: 'fail',
      candidateDigest: null,
      issues: parsed.error.issues.map(issue => ({
        code: 'record-schema',
        message: `${issue.path.join('.') || 'record'}: ${issue.message}`,
      })),
    };
  }
  const record = parsed.data;
  const issues: BlogCertificationIssue[] = [];
  if (context.sourceContent === undefined) {
    addIssue(
      issues,
      'candidate-source-unverified',
      'the harness must read the Markdown candidate from sourcePath'
    );
  } else if (
    digestOf(context.sourceContent) !== record.candidate.contentDigest
  ) {
    addIssue(
      issues,
      'candidate-source-mismatch',
      'the Markdown on disk does not match the bound content digest'
    );
  }
  if (
    record.candidateDigest !==
    blogCandidateDigest(record.candidate, record.evidence)
  ) {
    addIssue(
      issues,
      'candidate-digest-mismatch',
      'candidate digest does not bind content, metadata, assets, revisions and evidence'
    );
  }
  validateEvidence(record, issues);
  validateQualificationEvidence(record, issues);
  validateReceiptChain(record, issues);
  validatePublication(record, issues);
  if (issues.length > 0) {
    return { verdict: 'fail', candidateDigest: record.candidateDigest, issues };
  }
  if (!record.publication) {
    return {
      verdict: 'authorization-required',
      candidateDigest: record.candidateDigest,
      issues: [
        {
          code: 'publication-authorization-missing',
          message:
            'candidate is qualified through adversarial trust but has no authorized publication receipt',
          stage: 'publish',
        },
      ],
    };
  }
  return {
    verdict: 'pass',
    candidateDigest: record.candidateDigest,
    issues: [],
  };
}

export function classifyBlogPublicationRetry(
  existing: BlogPublicationReceipt | null,
  requested: BlogPublicationReceipt
): 'publish' | 'reuse' | 'reject-stale' {
  if (!existing) return 'publish';
  return existing.idempotencyKey === requested.idempotencyKey
    ? 'reuse'
    : 'reject-stale';
}
