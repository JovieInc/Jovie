import { describe, expect, it } from 'vitest';
import {
  applyStagePassedBit,
  FACTORY_CERTIFIER_HARNESS,
  FACTORY_RECEIPT_SCHEMA,
  FACTORY_STAGES,
  type FactoryStage,
} from '../../data/marketing/factory/spine';
import {
  BLOG_COPY_EVALUATOR_VERSION,
  BLOG_EDITORIAL_EVALUATOR_VERSION,
  BLOG_FACTORY_POLICY_VERSION,
  BLOG_FACTORY_RECORD_SCHEMA,
  BLOG_PUBLICATION_RECEIPT_SCHEMA,
  BLOG_VISUAL_EVALUATOR_VERSION,
  type BlogCandidate,
  type BlogClaimEvidence,
  type BlogFactoryRecord,
  type BlogPublicationReceipt,
  blogCandidateDigest,
  blogPublicationIdempotencyKey,
  certifyBlogFactoryRecord,
  classifyBlogPublicationRetry,
  defineBlogStageArtifact,
} from './blog-adapter';
import { digestOf, stageInputDigest } from './receipts';

const AS_OF = '2026-10-01T18:00:00.000Z';
const MARKDOWN = 'markdown';

function hash(value: string): string {
  return digestOf(value);
}

function evidence(
  overrides: Partial<BlogClaimEvidence> = {}
): BlogClaimEvidence {
  return {
    claimId: 'external.canary.fact',
    kind: 'external',
    sourceRef: 'research:canary/fact',
    sourceDigest: hash('source fact'),
    checkedAt: '2026-10-01T16:00:00.000Z',
    validUntil: '2026-11-01T00:00:00.000Z',
    sensitivity: 'ordinary',
    authorizationRef: null,
    ...overrides,
  };
}

function candidate(): BlogCandidate {
  return {
    articleId: 'blog.canary',
    slug: 'canary',
    sourcePath: 'content/blog/canary.md',
    contentDigest: hash(MARKDOWN),
    metadataDigest: hash('metadata'),
    assets: [{ id: 'hero', digest: hash('hero'), alt: 'Canary artwork' }],
    rendererRevision: 'a'.repeat(40),
    sourceRevision: 'b'.repeat(40),
    candidateBuild: 'build-canary-1',
    eligibilityReceiptDigest: hash('eligibility'),
    policyVersion: BLOG_FACTORY_POLICY_VERSION,
    evaluatorVersions: {
      copy: BLOG_COPY_EVALUATOR_VERSION,
      editorial: BLOG_EDITORIAL_EVALUATOR_VERSION,
      visual: BLOG_VISUAL_EVALUATOR_VERSION,
    },
    asOf: AS_OF,
  };
}

const ARTICLE_CHECKS = [
  'reading-hierarchy',
  'internal-links',
  'external-links',
  'accessibility',
  'overflow',
  'artwork-fallback',
  'canonical-metadata',
  'seo-metadata',
  'performance-budget',
] as const;

const SHARE_CHECKS = [
  'accessibility',
  'overflow',
  'artwork-fallback',
  'share-preview',
] as const;

function renderCaptures() {
  const dimensions = {
    phone: { width: 390, height: 844 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 },
  } as const;
  const article = (['phone', 'tablet', 'desktop'] as const).flatMap(viewport =>
    (['light', 'dark'] as const).map(theme => ({
      outputId: `article-${viewport}-${theme}`,
      kind: 'article' as const,
      pathname: '/blog/canary',
      viewport,
      theme,
      ...dimensions[viewport],
      httpStatus: 200,
      screenshot: {
        path: `fixture:article-${viewport}-${theme}.png`,
        digest: hash(`article-${viewport}-${theme}`),
      },
      cls: 0,
      lcpMs: 1200,
      domFindings: [],
      checksPassed: [...ARTICLE_CHECKS],
      checksFailed: [],
    }))
  );
  const discovery = (['light', 'dark'] as const).map(theme => ({
    outputId: `discovery-desktop-${theme}`,
    kind: 'discovery' as const,
    pathname: '/blog',
    viewport: 'desktop' as const,
    theme,
    ...dimensions.desktop,
    httpStatus: 200,
    screenshot: {
      path: `fixture:discovery-${theme}.png`,
      digest: hash(`discovery-${theme}`),
    },
    cls: 0,
    lcpMs: 1200,
    domFindings: [],
    checksPassed: [...ARTICLE_CHECKS],
    checksFailed: [],
  }));
  const share = (['light', 'dark'] as const).map(theme => ({
    outputId: `share-desktop-${theme}`,
    kind: 'share' as const,
    pathname: '/blog/canary/opengraph-image',
    viewport: 'desktop' as const,
    theme,
    ...dimensions.desktop,
    httpStatus: 200,
    screenshot: {
      path: `fixture:share-${theme}.png`,
      digest: hash(`share-${theme}`),
    },
    cls: 0,
    lcpMs: 1200,
    domFindings: [],
    checksPassed: [...SHARE_CHECKS],
    checksFailed: [],
  }));
  return [...article, ...discovery, ...share];
}

function publicationFor(
  candidateValue: BlogCandidate,
  candidateDigest: string
): BlogPublicationReceipt {
  const url = 'https://jov.ie/blog/canary';
  const indexingState = 'noindex' as const;
  return {
    schema: BLOG_PUBLICATION_RECEIPT_SCHEMA,
    articleId: candidateValue.articleId,
    candidateDigest,
    exactRevision: candidateValue.sourceRevision,
    candidateBuild: candidateValue.candidateBuild,
    url,
    eligibilityReceiptDigest: candidateValue.eligibilityReceiptDigest,
    indexingState,
    authorization: {
      grantId: 'existing-blog-noindex-grant',
      receiptDigest: hash('publication authorization'),
      candidateDigest,
      allowedIndexingStates: ['noindex'],
      expiresAt: '2026-10-02T00:00:00.000Z',
    },
    publishedAt: '2026-10-01T18:30:00.000Z',
    deployed: {
      contentDigest: candidateValue.contentDigest,
      metadataDigest: candidateValue.metadataDigest,
      shareDigest: hash('share'),
    },
    liveChecks: {
      checkedAt: '2026-10-01T19:00:00.000Z',
      httpStatus: 200,
      pageMatches: true,
      metadataMatches: true,
      shareMatches: true,
      discoveryMatches: true,
    },
    revert: {
      method: 'withdraw',
      testedAt: '2026-10-01T17:00:00.000Z',
      passed: true,
    },
    idempotencyKey: blogPublicationIdempotencyKey({
      articleId: candidateValue.articleId,
      candidateDigest,
      exactRevision: candidateValue.sourceRevision,
      url,
      indexingState,
    }),
  };
}

function evaluatorsFor(stage: FactoryStage) {
  if (stage === 'copy') {
    return [
      {
        id: 'openai/copy-judge',
        family: 'openai',
        kind: 'llm' as const,
        verdict: 'pass' as const,
        score: 0.95,
        rubricVersion: BLOG_COPY_EVALUATOR_VERSION,
      },
    ];
  }
  if (stage === 'adversarial-trust') {
    return [
      {
        id: 'openai/editorial-judge',
        family: 'openai',
        kind: 'llm' as const,
        verdict: 'pass' as const,
        score: 0.94,
        rubricVersion: BLOG_EDITORIAL_EVALUATOR_VERSION,
      },
      {
        id: 'google/visual-judge',
        family: 'google',
        kind: 'vision' as const,
        verdict: 'pass' as const,
        score: 0.92,
        rubricVersion: BLOG_VISUAL_EVALUATOR_VERSION,
      },
    ];
  }
  return [];
}

function factoryRecord(
  options: {
    readonly published?: boolean;
    readonly claimEvidence?: readonly BlogClaimEvidence[];
  } = {}
): BlogFactoryRecord {
  const candidateValue = candidate();
  const evidenceValue = [...(options.claimEvidence ?? [evidence()])];
  const candidateDigest = blogCandidateDigest(candidateValue, evidenceValue);
  const publication = options.published
    ? publicationFor(candidateValue, candidateDigest)
    : null;
  const core = {
    schema: BLOG_FACTORY_RECORD_SCHEMA,
    family: 'blog' as const,
    status: options.published ? ('noindex' as const) : ('shadow' as const),
    candidateDigest,
    candidate: candidateValue,
    evidence: evidenceValue,
    contentChecks: {
      candidateDigest,
      materialClaimIds: evidenceValue.map(item => item.claimId),
      metadataValid: true,
      authorAttributionValid: true,
      safeMarkdown: true,
      linksValid: true,
      richBlocksAllowlisted: true,
      copyLintPassed: true,
    },
    renderEvidence: {
      candidateDigest,
      captures: renderCaptures(),
      missingArtworkFallbackTested: true,
      poorArtworkFallbackTested: true,
    },
    seoEvidence: {
      candidateDigest,
      canonicalUrl: 'https://jov.ie/blog/canary',
      metadataDigest: candidateValue.metadataDigest,
      shareDigest: hash('share'),
      canonicalPassed: true,
      structuredDataPassed: true,
      indexingPolicyPassed: true,
    },
    editorialEvidence: {
      candidateDigest,
      freshContext: true,
      usefulnessPassed: true,
      accuracyPassed: true,
      claimSupportPassed: true,
      unsupportedClaims: [],
    },
    publication,
  } satisfies Omit<BlogFactoryRecord, 'stageArtifacts' | 'receipts'>;
  const stages = publication ? FACTORY_STAGES : FACTORY_STAGES.slice(0, -1);
  const stageArtifacts = stages.map(stage =>
    defineBlogStageArtifact(core, stage)
  );
  const priorOutputs: string[] = [];
  const receipts = stageArtifacts.map(artifact => {
    const outputDigest = digestOf(artifact);
    const producer =
      artifact.stage === 'copy' || artifact.stage === 'adversarial-trust'
        ? {
            modelId: 'anthropic/author',
            family: 'anthropic',
            channel: 'ai-gateway' as const,
          }
        : null;
    const receipt = applyStagePassedBit(
      {
        schema: FACTORY_RECEIPT_SCHEMA,
        pageId: candidateValue.articleId,
        stage: artifact.stage,
        attempt: 1,
        inputDigest: stageInputDigest(candidateDigest, priorOutputs),
        outputDigest,
        producer,
        evaluators: evaluatorsFor(artifact.stage),
        invariantsPassed: [`blog-${artifact.stage}`],
        invariantsFailed: [],
        at: AS_OF,
      },
      { certifier: FACTORY_CERTIFIER_HARNESS }
    );
    priorOutputs.push(outputDigest);
    return receipt;
  });
  return { ...core, stageArtifacts, receipts };
}

function issueCodes(record: unknown): string[] {
  return certifyBlogFactoryRecord(record, {
    sourceContent: MARKDOWN,
  }).issues.map(issue => issue.code);
}

describe('blog factory adapter', () => {
  it('runs the canary through the authorized stage without labeling missing publication authority PASS', () => {
    const result = certifyBlogFactoryRecord(factoryRecord(), {
      sourceContent: MARKDOWN,
    });

    expect(result.verdict).toBe('authorization-required');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'publication-authorization-missing',
        stage: 'publish',
      }),
    ]);
  });

  it('passes only an exact authorized candidate with live and revert evidence', () => {
    const result = certifyBlogFactoryRecord(
      factoryRecord({ published: true }),
      {
        sourceContent: MARKDOWN,
      }
    );

    expect(result).toMatchObject({ verdict: 'pass', issues: [] });
  });

  it('rejects unsupported product claims instead of treating them as facts', () => {
    const record = factoryRecord({
      claimEvidence: [
        evidence({
          claimId: 'capability.invented.metric',
          kind: 'product-truth',
          sourceRef: 'product-truth:capability.invented.metric',
          validUntil: null,
        }),
      ],
    });

    expect(issueCodes(record)).toContain('unsupported-product-claim');
  });

  it('rejects stale and forged receipts after the candidate changes', () => {
    const stale = structuredClone(factoryRecord({ published: true }));
    stale.candidate.metadataDigest = hash('changed metadata');
    expect(issueCodes(stale)).toContain('candidate-digest-mismatch');

    const forged = structuredClone(factoryRecord({ published: true }));
    forged.receipts[0] = {
      ...forged.receipts[0],
      certifier: 'authoring-agent',
      passed: true,
    };
    expect(issueCodes(forged)).toContain('invalid-stage-receipt');
  });

  it('rejects a record that is not bound to the Markdown bytes on disk', () => {
    const record = factoryRecord({ published: true });
    expect(certifyBlogFactoryRecord(record).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'candidate-source-unverified' }),
      ])
    );
    expect(
      certifyBlogFactoryRecord(record, { sourceContent: 'changed' }).issues
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'candidate-source-mismatch' }),
      ])
    );
  });

  it('rejects broken links and unsafe Markdown even with old passing receipts', () => {
    const broken = structuredClone(factoryRecord({ published: true }));
    broken.contentChecks.linksValid = false;
    expect(issueCodes(broken)).toContain('content-linksValid');

    const unsafe = structuredClone(factoryRecord({ published: true }));
    unsafe.contentChecks.safeMarkdown = false;
    expect(issueCodes(unsafe)).toContain('content-safeMarkdown');
  });

  it('rejects a failed rendered check and missing affected output', () => {
    const failed = structuredClone(factoryRecord({ published: true }));
    failed.renderEvidence.captures[0]?.checksFailed.push('overflow');
    expect(issueCodes(failed)).toContain('failed-render-check');

    const missing = structuredClone(factoryRecord({ published: true }));
    missing.renderEvidence.captures = missing.renderEvidence.captures.filter(
      capture => capture.kind !== 'share'
    );
    expect(issueCodes(missing)).toContain('missing-render-output');
  });

  it('requires live matching and a tested withdraw path', () => {
    const record = structuredClone(factoryRecord({ published: true }));
    if (!record.publication) throw new Error('fixture publication missing');
    record.publication.liveChecks.shareMatches = false;
    record.publication.revert.passed = false;

    expect(issueCodes(record)).toEqual(
      expect.arrayContaining([
        'live-verification-failed',
        'revert-path-untested',
      ])
    );
  });

  it('reuses an identical publication retry and rejects a stale retry', () => {
    const record = factoryRecord({ published: true });
    if (!record.publication) throw new Error('fixture publication missing');
    expect(
      classifyBlogPublicationRetry(record.publication, record.publication)
    ).toBe('reuse');
    expect(classifyBlogPublicationRetry(null, record.publication)).toBe(
      'publish'
    );

    const stale = {
      ...record.publication,
      idempotencyKey: hash('another candidate'),
    };
    expect(classifyBlogPublicationRetry(record.publication, stale)).toBe(
      'reject-stale'
    );
  });
});
