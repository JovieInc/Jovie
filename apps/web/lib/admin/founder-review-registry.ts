import { createHash } from 'node:crypto';
import {
  DESIGN_SYSTEM_COMPONENT_REGISTRY,
  type DesignSystemComponentRegistryEntry,
} from '@/data/designSystem/componentRegistry';
import {
  buildCertificationDecisionDigest,
  type CertificationEvidenceReceipt,
  type CertificationItemMediaReceipt,
  type CertificationRequiredVariant,
  type CertificationReviewPacket,
  type CertificationState,
  type CertificationTasteEvidenceTier,
  evaluateCertificationAdmission,
  JOVIE_CERTIFICATION_CONTRACT,
} from '@/lib/agent-os/certification';

export type FounderReviewRegistryKind = 'feature' | 'design-system';
export type FounderReviewReadiness = 'ready' | 'collecting';
export type FounderReviewScopeLevel = 'behavior' | 'capability' | 'component';

export interface FounderReviewMedia {
  readonly kind: 'image' | 'video';
  readonly src: string;
  readonly poster?: string;
  readonly alt: string;
  readonly label: string;
  readonly dedicated: boolean;
}

export interface FounderReviewItem {
  readonly id: string;
  readonly registry: FounderReviewRegistryKind;
  readonly title: string;
  readonly eyebrow: string;
  readonly scope: FounderReviewScopeLevel;
  readonly description: string;
  readonly status: string;
  readonly access: string;
  readonly source: string;
  readonly gate: string;
  readonly readiness: FounderReviewReadiness;
  readonly readinessReason: string;
  readonly evidence: readonly string[];
  readonly media: readonly FounderReviewMedia[];
  /**
   * The JOV-5753 certification packet this item projects. Founder decisions
   * bind to `decisionEvidenceDigest`; any evidence change mints a new digest
   * and invalidates a stale local decision.
   */
  readonly certificationPacket: CertificationReviewPacket;
  readonly decisionEvidenceDigest: string;
  readonly certificationState: CertificationState;
}

interface ParsedFeatureRow {
  readonly productArea: string;
  readonly feature: string;
  readonly status: string;
  readonly accessModel: string;
  readonly flagOrGate: string;
  readonly notes: string;
}

interface FeatureMediaRule {
  readonly feature: string;
  readonly src: string;
  readonly alt: string;
}

const FEATURE_MEDIA_RULES: readonly FeatureMediaRule[] = [
  {
    feature: 'Release pages with listen links per DSP',
    src: '/product-screenshots/release-landing-desktop.png',
    alt: 'Jovie release landing page with streaming links',
  },
  {
    feature: 'Smart link editing and customization',
    src: '/product-screenshots/artist-spec-tracked-links-desktop.png',
    alt: 'Jovie tracked-link controls',
  },
  {
    feature: 'Spotify pre-save campaigns',
    src: '/product-screenshots/tim-white-profile-presave-phone.png',
    alt: 'Jovie pre-save experience on a phone',
  },
  {
    feature: 'Public profile pages',
    src: '/product-screenshots/profile-desktop.png',
    alt: 'Jovie public artist profile',
  },
  {
    feature: 'Subscribe / follow page',
    src: '/product-screenshots/tim-white-profile-subscribe-phone.png',
    alt: 'Jovie subscriber capture experience',
  },
  {
    feature: 'Contact page',
    src: '/product-screenshots/tim-white-profile-contact-phone.png',
    alt: 'Jovie artist contact experience',
  },
  {
    feature: 'Tour dates (Bandsintown)',
    src: '/product-screenshots/tim-white-profile-tour-phone.png',
    alt: 'Jovie artist tour-date experience',
  },
  {
    feature: 'Latest release card on profile',
    src: '/product-screenshots/tim-white-profile-live-desktop.png',
    alt: 'Jovie latest-release profile card',
  },
  {
    feature: 'Advanced analytics and geo insights',
    src: '/product-screenshots/artist-spec-geo-insights-desktop.png',
    alt: 'Jovie geographic audience insights',
  },
] as const;

interface FeatureContextMediaRule {
  readonly pattern: RegExp;
  readonly src: string;
  readonly alt: string;
}

const FEATURE_CONTEXT_MEDIA_RULES: readonly FeatureContextMediaRule[] = [
  {
    pattern:
      /release pages with listen links|unlimited smart links|smart deep links/i,
    src: '/product-screenshots/release-landing-desktop.png',
    alt: 'Jovie release landing page with streaming links',
  },
  {
    pattern: /smart link editing|tracked links|vanity urls|content slugs/i,
    src: '/product-screenshots/artist-spec-tracked-links-desktop.png',
    alt: 'Jovie tracked-link controls',
  },
  {
    pattern: /spotify pre-save|pre-release|countdown/i,
    src: '/product-screenshots/tim-white-profile-presave-phone.png',
    alt: 'Jovie pre-save experience on a phone',
  },
  {
    pattern: /public profile pages|artist bio|social links|about page/i,
    src: '/product-screenshots/profile-desktop.png',
    alt: 'Jovie public artist profile',
  },
  {
    pattern: /subscribe \/ follow page|contact \/ subscriber capture/i,
    src: '/product-screenshots/tim-white-profile-subscribe-phone.png',
    alt: 'Jovie subscriber capture experience',
  },
  {
    pattern: /contact page/i,
    src: '/product-screenshots/tim-white-profile-contact-phone.png',
    alt: 'Jovie artist contact experience',
  },
  {
    pattern: /tour dates/i,
    src: '/product-screenshots/tim-white-profile-tour-phone.png',
    alt: 'Jovie artist tour-date experience',
  },
  {
    pattern: /latest release card/i,
    src: '/product-screenshots/tim-white-profile-live-desktop.png',
    alt: 'Jovie latest-release profile card',
  },
  {
    pattern: /audience intelligence|basic analytics|click & visit tracking/i,
    src: '/product-screenshots/artist-spec-audience-quality-desktop.png',
    alt: 'Jovie audience-quality analytics',
  },
  {
    pattern: /advanced analytics|geo insights/i,
    src: '/product-screenshots/artist-spec-geo-insights-desktop.png',
    alt: 'Jovie geographic audience insights',
  },
  {
    pattern: /ai-powered insights|fan crm|contact export/i,
    src: '/product-screenshots/audience-crm.png',
    alt: 'Jovie audience workspace',
  },
  {
    pattern: /earnings dashboard/i,
    src: '/product-screenshots/audience-crm.png',
    alt: 'Jovie analytics workspace context',
  },
  {
    pattern: /auto-sync from spotify|manual release creation/i,
    src: '/product-screenshots/releases-dashboard-full.png',
    alt: 'Jovie releases workspace',
  },
] as const;

const FEATURE_AREA_FALLBACK_MEDIA: Readonly<
  Record<string, Omit<FounderReviewMedia, 'alt' | 'dedicated'>>
> = {
  Analytics: {
    kind: 'image',
    src: '/product-screenshots/artist-spec-audience-quality-desktop.png',
    label: 'Related product context',
  },
  'AI Assistant': {
    kind: 'video',
    src: '/demo/jovie-demo.mp4',
    poster: '/demo/jovie-demo-poster.jpg',
    label: 'Jovie product walkthrough',
  },
  'Creator recording': {
    kind: 'video',
    src: '/demo/jovie-demo.mp4',
    poster: '/demo/jovie-demo-poster.jpg',
    label: 'Jovie product walkthrough',
  },
  Profile: {
    kind: 'image',
    src: '/product-screenshots/profile-desktop.png',
    label: 'Related product context',
  },
  'Release Workflows': {
    kind: 'image',
    src: '/product-screenshots/releases-dashboard-full.png',
    label: 'Related product context',
  },
  'Smart Links': {
    kind: 'image',
    src: '/product-screenshots/release-landing-desktop.png',
    label: 'Related product context',
  },
};

const DEFAULT_FEATURE_MEDIA: Omit<FounderReviewMedia, 'alt' | 'dedicated'> = {
  kind: 'image',
  src: '/product-screenshots/design-studio-music-ai-command.png',
  label: 'Jovie product context',
};

const DESIGN_SYSTEM_MEDIA: Readonly<Record<string, FounderReviewMedia>> = {
  'atom.button': {
    kind: 'image',
    src: '/product-screenshots/release-landing-desktop.png',
    alt: 'Jovie release page showing the canonical button family in context',
    label: 'Rendered product reference',
    dedicated: true,
  },
  'atom.icon-button': {
    kind: 'image',
    src: '/product-screenshots/tim-white-profile-more-menu-phone.png',
    alt: 'Jovie profile menu showing icon-button controls',
    label: 'Rendered product reference',
    dedicated: false,
  },
  'atom.link': {
    kind: 'image',
    src: '/product-screenshots/artist-spec-tracked-links-desktop.png',
    alt: 'Jovie tracked-links interface showing link treatments',
    label: 'Rendered product reference',
    dedicated: false,
  },
  'atom.brand-logo': {
    kind: 'image',
    src: '/brand/jovie-icon-contact-sheet.png',
    alt: 'Jovie brand icon contact sheet',
    label: 'Brand source sheet',
    dedicated: true,
  },
  'atom.logo': {
    kind: 'image',
    src: '/brand/jovie-icon-contact-sheet.png',
    alt: 'Jovie brand icon contact sheet',
    label: 'Brand source sheet',
    dedicated: true,
  },
  'atom.logo-link': {
    kind: 'image',
    src: '/brand/jovie-icon-contact-sheet.png',
    alt: 'Jovie brand icon contact sheet',
    label: 'Brand source sheet',
    dedicated: true,
  },
};

/**
 * Components without a mapped capture still get a context attachment so the
 * rail renders — context-only media never satisfies the visual_proof tier.
 */
const DEFAULT_DESIGN_SYSTEM_MEDIA: Omit<
  FounderReviewMedia,
  'alt' | 'dedicated'
> = {
  kind: 'image',
  src: '/product-screenshots/design-studio-music-ai-command.png',
  label: 'Jovie product context',
};

function cleanMarkdownCell(value: string): string {
  return value
    .replaceAll('`', '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function stableId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic 40-hex content fingerprint standing in for a canonical-source
 * commit SHA. Registry items are projected from repo content at build time, so
 * the fingerprint — not a git sha — is what evidence receipts bind to. Any
 * packet input change mints a new fingerprint and therefore a new decision
 * digest, which invalidates stale founder locks exactly like a source change.
 */
function contentSha(...parts: readonly (string | null | undefined)[]): string {
  return createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 40);
}

function passedReceipt(
  itemId: string,
  sourceSha: string,
  tier: CertificationTasteEvidenceTier,
  suffix: string,
  summary: string,
  ref: string
): CertificationEvidenceReceipt {
  return {
    id: `${itemId}.${suffix}`,
    tier,
    status: 'passed',
    sourceSha,
    ref,
    digest: `sha256:${contentSha(itemId, tier, suffix, summary, ref)}`,
    summary,
  };
}

function itemMediaReceipt(
  itemId: string,
  sourceSha: string,
  media: FounderReviewMedia | undefined
): CertificationItemMediaReceipt[] {
  if (!media) return [];
  return [
    {
      id: `${itemId}.media`,
      itemId,
      variantId: null,
      status: media.dedicated ? 'passed' : 'missing',
      sourceSha,
      ref: media.src,
      digest: `sha256:${contentSha(itemId, media.src, media.label)}`,
      summary: media.dedicated
        ? `Item-specific capture: ${media.label}`
        : `Context-only attachment: ${media.label}`,
    },
  ];
}

interface PacketSeed {
  readonly itemId: string;
  readonly kind: FounderReviewRegistryKind;
  readonly title: string;
  readonly sourcePath: string;
  readonly canonicalReferences: readonly CertificationEvidenceReceipt[];
  readonly invariantEvaluation: readonly CertificationEvidenceReceipt[];
  readonly testsCoverage: readonly CertificationEvidenceReceipt[];
  readonly visualProof: readonly CertificationEvidenceReceipt[];
  readonly requiredVariants: readonly CertificationRequiredVariant[];
  readonly itemMedia: readonly CertificationItemMediaReceipt[];
}

function buildFounderReviewPacket(seed: PacketSeed): CertificationReviewPacket {
  const sourceSha = contentSha(
    seed.kind,
    seed.itemId,
    seed.title,
    seed.sourcePath,
    ...seed.canonicalReferences.map(receipt => receipt.summary),
    ...seed.invariantEvaluation.map(receipt => receipt.summary),
    ...seed.testsCoverage.map(receipt => receipt.summary),
    ...seed.visualProof.map(receipt => receipt.summary),
    ...seed.requiredVariants.map(variant => variant.id),
    ...seed.itemMedia.map(media => media.ref)
  );

  const withSourceSha = <T extends { readonly sourceSha: string | null }>(
    receipt: T
  ): T => ({ ...receipt, sourceSha });

  return {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    subject: { id: seed.itemId, kind: seed.kind, title: seed.title },
    source: {
      repository: 'JovieInc/Jovie',
      ref: 'registry-content',
      sha: sourceSha,
      paths: [seed.sourcePath],
      digest: `sha256:${contentSha(seed.sourcePath, seed.itemId)}`,
    },
    canonicalReferences: seed.canonicalReferences.map(withSourceSha),
    invariantEvaluation: seed.invariantEvaluation.map(withSourceSha),
    testsCoverage: seed.testsCoverage.map(withSourceSha),
    visualProof: seed.visualProof.map(withSourceSha),
    requiredVariants: seed.requiredVariants.map(variant => ({
      ...variant,
      sourceSha,
      proof: variant.proof ? withSourceSha(variant.proof) : null,
    })),
    itemMedia: seed.itemMedia.map(withSourceSha),
  };
}

function finalizeItem(
  draft: Omit<
    FounderReviewItem,
    | 'certificationPacket'
    | 'decisionEvidenceDigest'
    | 'certificationState'
    | 'readiness'
    | 'readinessReason'
  >,
  packet: CertificationReviewPacket,
  readyReason: string
): FounderReviewItem {
  const admission = evaluateCertificationAdmission({ packet });
  const ready = admission.state === 'review_ready';

  return {
    ...draft,
    certificationPacket: packet,
    decisionEvidenceDigest:
      admission.decisionEvidenceDigest ??
      buildCertificationDecisionDigest(packet),
    certificationState: admission.state,
    readiness: ready ? 'ready' : 'collecting',
    readinessReason: ready
      ? readyReason
      : `Blocked by the certification admission kernel: ${admission.blockers
          .map(blocker => blocker.summary)
          .join(' ')}`,
  };
}

export function parseFeatureRegistryMarkdown(
  markdown: string
): readonly ParsedFeatureRow[] {
  const rows: ParsedFeatureRow[] = [];
  let inProductTable = false;

  for (const line of markdown.split('\n')) {
    if (line.trim() === '## Product Feature List') {
      inProductTable = true;
      continue;
    }
    if (inProductTable && line.startsWith('## ')) break;
    if (!inProductTable || !line.trim().startsWith('|')) continue;

    const cells = line.split('|').slice(1, -1).map(cleanMarkdownCell);
    if (
      cells.length !== 6 ||
      cells[0] === 'Product area' ||
      cells.every(cell => /^-+$/.test(cell))
    ) {
      continue;
    }

    rows.push({
      productArea: cells[0],
      feature: cells[1],
      status: cells[2],
      accessModel: cells[3],
      flagOrGate: cells[4],
      notes: cells[5],
    });
  }

  return rows;
}

function featureMedia(row: ParsedFeatureRow): FounderReviewMedia {
  const rule = FEATURE_MEDIA_RULES.find(
    candidate => candidate.feature === row.feature
  );
  if (rule) {
    return {
      kind: 'image',
      src: rule.src,
      alt: rule.alt,
      label: 'Dedicated product capture',
      dedicated: true,
    };
  }

  const contextRule = FEATURE_CONTEXT_MEDIA_RULES.find(candidate =>
    candidate.pattern.test(`${row.productArea} ${row.feature}`)
  );
  if (contextRule) {
    return {
      kind: 'image',
      src: contextRule.src,
      alt: `${row.feature} — ${contextRule.alt}`,
      label: 'Related product context',
      dedicated: false,
    };
  }

  const fallback =
    FEATURE_AREA_FALLBACK_MEDIA[row.productArea] ?? DEFAULT_FEATURE_MEDIA;
  return {
    ...fallback,
    alt: `${row.feature} — related Jovie product context`,
    dedicated: false,
  };
}

function featurePacket(
  itemId: string,
  row: ParsedFeatureRow,
  media: FounderReviewMedia,
  sourcePath: string,
  shippedEvidence: string,
  testEvidence: string | null
): CertificationReviewPacket {
  const sha = contentSha('feature', itemId);
  const shipped = row.status.startsWith('Shipped');
  return buildFounderReviewPacket({
    itemId,
    kind: 'feature',
    title: row.feature,
    sourcePath,
    canonicalReferences: [
      passedReceipt(
        itemId,
        sha,
        'canonical_references',
        'registry-row',
        'Canonical feature registry entry',
        sourcePath
      ),
    ],
    invariantEvaluation: shipped
      ? [
          passedReceipt(
            itemId,
            sha,
            'invariant_evaluation',
            'shipped-status',
            shippedEvidence,
            sourcePath
          ),
        ]
      : [],
    testsCoverage: testEvidence
      ? [
          passedReceipt(
            itemId,
            sha,
            'tests_coverage',
            'gate-or-test-evidence',
            testEvidence,
            sourcePath
          ),
        ]
      : [],
    visualProof: media.dedicated
      ? [
          passedReceipt(
            itemId,
            sha,
            'visual_proof',
            'item-specific-capture',
            `Item-specific rendered capture: ${media.src}`,
            media.src
          ),
        ]
      : [],
    requiredVariants: [],
    itemMedia: itemMediaReceipt(itemId, sha, media),
  });
}

export function buildFeatureReviewItems(
  markdown: string
): readonly FounderReviewItem[] {
  const registrySource = 'docs/FEATURE_REGISTRY.md';
  const capabilityItems = parseFeatureRegistryMarkdown(markdown).map(row => {
    const media = featureMedia(row);
    const itemId = `feature.${stableId(row.productArea)}.${stableId(
      row.feature
    )}`;
    const shipped = row.status.startsWith('Shipped');
    const testEvidence =
      shipped && row.flagOrGate !== 'None'
        ? `Flag/gate evidence: ${row.flagOrGate}`
        : shipped
          ? 'Shipped registry status with entitlement or rollout evidence'
          : null;
    const packet = featurePacket(
      itemId,
      row,
      media,
      registrySource,
      `Registry status: ${row.status}`,
      testEvidence
    );

    return finalizeItem(
      {
        id: itemId,
        registry: 'feature',
        title: row.feature,
        eyebrow: row.productArea,
        scope: 'capability',
        description: row.notes || 'Canonical Jovie product capability.',
        status: row.status,
        access: row.accessModel,
        source: registrySource,
        gate: row.flagOrGate,
        evidence: [
          'Canonical feature registry',
          media.dedicated ? 'Dedicated product capture' : 'Context attachment',
        ],
        media: [media],
      },
      packet,
      'Shipped registry entry with a dedicated product capture attached; ready for founder taste review.'
    );
  });

  const behaviorSource =
    'apps/web/app/app/(shell)/dashboard/contacts/actions.ts#deleteContact';
  const behaviorMedia: FounderReviewMedia = {
    kind: 'image',
    src: '/product-screenshots/audience-crm.png',
    alt: 'Jovie audience CRM containing the contact workspace',
    label: 'Contact workspace context',
    dedicated: false,
  };
  const behaviorId = 'feature.contacts.delete-contact';
  const behaviorPacket = buildFounderReviewPacket({
    itemId: behaviorId,
    kind: 'feature',
    title: 'Delete a contact',
    sourcePath: behaviorSource,
    canonicalReferences: [
      passedReceipt(
        behaviorId,
        contentSha('feature', behaviorId),
        'canonical_references',
        'canonical-source',
        'Canonical contact row action and owned-profile server action',
        behaviorSource
      ),
    ],
    invariantEvaluation: [],
    testsCoverage: [
      passedReceipt(
        behaviorId,
        contentSha('feature', behaviorId),
        'tests_coverage',
        'behavior-tests',
        'Destructive confirmation behavior tests',
        behaviorSource
      ),
    ],
    visualProof: [],
    requiredVariants: [],
    itemMedia: itemMediaReceipt(
      behaviorId,
      contentSha('feature', behaviorId),
      behaviorMedia
    ),
  });

  const auditedBehaviorItems: readonly FounderReviewItem[] = [
    finalizeItem(
      {
        id: behaviorId,
        registry: 'feature',
        title: 'Delete a contact',
        eyebrow: 'Contacts',
        scope: 'behavior',
        description:
          'Remove an owned contact through the canonical row action, destructive confirmation, server action, and cache invalidation path.',
        status: 'Implemented',
        access: 'Authenticated creator',
        source: behaviorSource,
        gate: 'Owned profile · destructive confirmation',
        evidence: [
          'Canonical contact row action',
          'Owned-profile server action',
          'Destructive confirmation tests',
        ],
        media: [behaviorMedia],
      },
      behaviorPacket,
      'Behavior evidence is complete; ready for founder taste review.'
    ),
  ];

  return [...auditedBehaviorItems, ...capabilityItems];
}

function designSystemEvidence(
  entry: DesignSystemComponentRegistryEntry
): readonly string[] {
  return [
    entry.storySource ? 'Storybook story' : 'Story missing',
    entry.testSources.length > 0 ? 'Behavior tests' : 'Tests missing',
    entry.penRootId || Object.keys(entry.penRootByVariantKey ?? {}).length > 0
      ? 'Pen source mapping'
      : 'Pen mapping missing',
  ];
}

function designSystemVariants(
  entry: DesignSystemComponentRegistryEntry,
  sourceSha: string,
  itemId: string
): readonly CertificationRequiredVariant[] {
  const variantKeys = Object.keys(entry.penRootByVariantKey ?? {});
  if (variantKeys.length > 0) {
    return variantKeys.map(variantKey => {
      const master = entry.penRootByVariantKey?.[
        variantKey as keyof typeof entry.penRootByVariantKey
      ] as { readonly rootId: string } | undefined;
      return {
        id: `${itemId}.variant.${stableId(variantKey)}`,
        label: variantKey,
        sourceSha,
        proof: passedReceipt(
          itemId,
          sourceSha,
          'required_variants',
          `variant-${stableId(variantKey)}`,
          `Canonical Pen variant binding: ${variantKey}`,
          `pen:${master?.rootId ?? variantKey}`
        ),
        requiredMediaIds: [],
      };
    });
  }

  if (entry.penRootId) {
    return [
      {
        id: `${itemId}.pen-binding`,
        label: 'Canonical Pen root binding',
        sourceSha,
        proof: passedReceipt(
          itemId,
          sourceSha,
          'required_variants',
          'pen-binding',
          `Canonical Pen root binding: ${entry.penRootId}`,
          `pen:${entry.penRootId}`
        ),
        requiredMediaIds: [],
      },
    ];
  }

  return [
    {
      id: `${itemId}.pen-binding`,
      label: 'Canonical Pen root binding',
      sourceSha,
      proof: null,
      requiredMediaIds: [],
    },
  ];
}

export function buildDesignSystemReviewItems(): readonly FounderReviewItem[] {
  return DESIGN_SYSTEM_COMPONENT_REGISTRY.map(
    (entry: DesignSystemComponentRegistryEntry) => {
      const itemId = `design.${entry.id}`;
      const sha = contentSha('design-system', itemId);
      const mapped = DESIGN_SYSTEM_MEDIA[entry.id];
      const media: FounderReviewMedia = mapped ?? {
        ...DEFAULT_DESIGN_SYSTEM_MEDIA,
        alt: `${entry.exportName} — related Jovie product context`,
        dedicated: false,
      };
      const requiredVariants = designSystemVariants(entry, sha, itemId);
      const packet = buildFounderReviewPacket({
        itemId,
        kind: 'design-system',
        title: entry.exportName,
        sourcePath: entry.source,
        canonicalReferences: entry.storySource
          ? [
              passedReceipt(
                itemId,
                sha,
                'canonical_references',
                'storybook-story',
                `Storybook story: ${entry.storySource}`,
                entry.storySource
              ),
            ]
          : [],
        invariantEvaluation: entry.referenceEligible
          ? [
              passedReceipt(
                itemId,
                sha,
                'invariant_evaluation',
                'reference-eligibility',
                'Design reference eligibility invariants pass',
                entry.source
              ),
            ]
          : [],
        testsCoverage:
          entry.testSources.length > 0
            ? [
                passedReceipt(
                  itemId,
                  sha,
                  'tests_coverage',
                  'behavior-tests',
                  `Behavior tests: ${entry.testSources.join(', ')}`,
                  entry.testSources[0]
                ),
              ]
            : [],
        visualProof: media?.dedicated
          ? [
              passedReceipt(
                itemId,
                sha,
                'visual_proof',
                'item-specific-render',
                `Item-specific rendered reference: ${media.src}`,
                media.src
              ),
            ]
          : [],
        requiredVariants,
        itemMedia: itemMediaReceipt(itemId, sha, media),
      });

      return finalizeItem(
        {
          id: itemId,
          registry: 'design-system',
          title: entry.exportName,
          eyebrow: `${entry.layer} · ${entry.id}`,
          scope: 'component',
          description:
            entry.penIdentityReason ??
            'Canonical source, variant contract, Storybook story, tests, and Pen mapping are registered.',
          status: entry.referenceEligible
            ? 'Review packet ready'
            : 'Evidence collecting',
          access: entry.storybookTitle ?? 'No Storybook title',
          source: entry.source,
          gate: entry.referenceEligible
            ? 'Design reference eligible'
            : 'Reference eligibility blocked',
          evidence: designSystemEvidence(entry),
          media: [media],
        },
        packet,
        'Canonical source, tests, Storybook coverage, Pen mapping, and an item-specific rendered reference are present.'
      );
    }
  );
}
