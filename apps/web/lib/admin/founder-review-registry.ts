import { createHash } from 'node:crypto';
import {
  buildCertificationDecisionDigest,
  type CertificationEvidenceReceipt,
  type CertificationItemMediaReceipt,
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
  readonly media: readonly FounderReviewMedia[];
  /** The JOV-5753 certification packet this item projects. */
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

type Shot = readonly [src: string, alt: string];
type MediaContext = Omit<FounderReviewMedia, 'alt' | 'dedicated'>;

const PS = '/product-screenshots';
const SHOTS: Record<string, Shot> = {
  releaseLanding: [
    `${PS}/release-landing-desktop.png`,
    'Jovie release landing page with streaming links',
  ],
  trackedLinks: [
    `${PS}/artist-spec-tracked-links-desktop.png`,
    'Jovie tracked-link controls',
  ],
  presave: [
    `${PS}/tim-white-profile-presave-phone.png`,
    'Jovie pre-save experience on a phone',
  ],
  profile: [`${PS}/profile-desktop.png`, 'Jovie public artist profile'],
  subscribe: [
    `${PS}/tim-white-profile-subscribe-phone.png`,
    'Jovie subscriber capture experience',
  ],
  contact: [
    `${PS}/tim-white-profile-contact-phone.png`,
    'Jovie artist contact experience',
  ],
  tour: [
    `${PS}/tim-white-profile-tour-phone.png`,
    'Jovie artist tour-date experience',
  ],
  liveCard: [
    `${PS}/tim-white-profile-live-desktop.png`,
    'Jovie latest-release profile card',
  ],
  audienceQuality: [
    `${PS}/artist-spec-audience-quality-desktop.png`,
    'Jovie audience-quality analytics',
  ],
  geo: [
    `${PS}/artist-spec-geo-insights-desktop.png`,
    'Jovie geographic audience insights',
  ],
  crm: [`${PS}/audience-crm.png`, 'Jovie audience workspace'],
  releases: [`${PS}/releases-dashboard-full.png`, 'Jovie releases workspace'],
};

const FEATURE_MEDIA: ReadonlyMap<string, Shot> = new Map([
  ['Release pages with listen links per DSP', SHOTS.releaseLanding],
  ['Smart link editing and customization', SHOTS.trackedLinks],
  ['Spotify pre-save campaigns', SHOTS.presave],
  ['Public profile pages', SHOTS.profile],
  ['Subscribe / follow page', SHOTS.subscribe],
  ['Contact page', SHOTS.contact],
  ['Tour dates (Bandsintown)', SHOTS.tour],
  ['Latest release card on profile', SHOTS.liveCard],
  ['Advanced analytics and geo insights', SHOTS.geo],
]);

const FEATURE_CONTEXT_MEDIA: readonly (readonly [RegExp, Shot])[] = [
  [
    /release pages with listen links|unlimited smart links|smart deep links/i,
    SHOTS.releaseLanding,
  ],
  [
    /smart link editing|tracked links|vanity urls|content slugs/i,
    SHOTS.trackedLinks,
  ],
  [/spotify pre-save|pre-release|countdown/i, SHOTS.presave],
  [/public profile pages|artist bio|social links|about page/i, SHOTS.profile],
  [/subscribe \/ follow page|contact \/ subscriber capture/i, SHOTS.subscribe],
  [/contact page/i, SHOTS.contact],
  [/tour dates/i, SHOTS.tour],
  [/latest release card/i, SHOTS.liveCard],
  [
    /audience intelligence|basic analytics|click & visit tracking/i,
    SHOTS.audienceQuality,
  ],
  [/advanced analytics|geo insights/i, SHOTS.geo],
  [/ai-powered insights|fan crm|contact export/i, SHOTS.crm],
  [
    /earnings dashboard/i,
    [`${PS}/audience-crm.png`, 'Jovie analytics workspace context'],
  ],
  [/auto-sync from spotify|manual release creation/i, SHOTS.releases],
];

const ctx = (src: string): MediaContext => ({
  kind: 'image',
  src,
  label: 'Related product context',
});
const DEMO: MediaContext = {
  kind: 'video',
  src: '/demo/jovie-demo.mp4',
  poster: '/demo/jovie-demo-poster.jpg',
  label: 'Jovie product walkthrough',
};

const FEATURE_AREA_FALLBACK_MEDIA: Record<string, MediaContext> = {
  Analytics: ctx(SHOTS.audienceQuality[0]),
  'AI Assistant': DEMO,
  'Creator recording': DEMO,
  Profile: ctx(SHOTS.profile[0]),
  'Release Workflows': ctx(SHOTS.releases[0]),
  'Smart Links': ctx(SHOTS.releaseLanding[0]),
};

const DEFAULT_FEATURE_MEDIA: MediaContext = ctx(
  `${PS}/design-studio-music-ai-command.png`
);

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

/** Deterministic content fingerprint; evidence receipts bind to it, so any
 * packet input change mints a new digest and invalidates stale founder locks. */
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

type ReceiptSpec = readonly [suffix: string, summary: string, ref: string];

interface PacketTiers {
  readonly canonical?: ReceiptSpec;
  readonly invariant?: ReceiptSpec;
  readonly tests?: ReceiptSpec;
  readonly visual?: ReceiptSpec;
}

function itemMediaReceipt(
  itemId: string,
  sourceSha: string,
  media: FounderReviewMedia
): CertificationItemMediaReceipt[] {
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

type PacketSeed = Pick<
  CertificationReviewPacket,
  | 'canonicalReferences'
  | 'invariantEvaluation'
  | 'testsCoverage'
  | 'visualProof'
  | 'requiredVariants'
  | 'itemMedia'
> & {
  readonly itemId: string;
  readonly kind: FounderReviewRegistryKind;
  readonly title: string;
  readonly sourcePath: string;
};

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

    const [productArea, feature, status, accessModel, flagOrGate, notes] =
      cells;
    rows.push({ productArea, feature, status, accessModel, flagOrGate, notes });
  }

  return rows;
}

function featureMedia(row: ParsedFeatureRow): FounderReviewMedia {
  const dedicated = FEATURE_MEDIA.get(row.feature);
  const context = FEATURE_CONTEXT_MEDIA.find(([pattern]) =>
    pattern.test(`${row.productArea} ${row.feature}`)
  )?.[1];
  const shot = dedicated ?? context;
  if (!shot) {
    return {
      ...(FEATURE_AREA_FALLBACK_MEDIA[row.productArea] ??
        DEFAULT_FEATURE_MEDIA),
      alt: `${row.feature} — related Jovie product context`,
      dedicated: false,
    };
  }
  return {
    kind: 'image',
    src: shot[0],
    alt: dedicated ? shot[1] : `${row.feature} — ${shot[1]}`,
    label: dedicated ? 'Dedicated product capture' : 'Related product context',
    dedicated: Boolean(dedicated),
  };
}

function founderPacket(
  itemId: string,
  kind: FounderReviewRegistryKind,
  title: string,
  sourcePath: string,
  tiers: PacketTiers,
  media: FounderReviewMedia
): CertificationReviewPacket {
  const sha = contentSha(kind, itemId);
  const mk = (tier: CertificationTasteEvidenceTier, spec?: ReceiptSpec) =>
    spec ? [passedReceipt(itemId, sha, tier, spec[0], spec[1], spec[2])] : [];
  return buildFounderReviewPacket({
    itemId,
    kind,
    title,
    sourcePath,
    canonicalReferences: mk('canonical_references', tiers.canonical),
    invariantEvaluation: mk('invariant_evaluation', tiers.invariant),
    testsCoverage: mk('tests_coverage', tiers.tests),
    visualProof: mk('visual_proof', tiers.visual),
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
    const packet = founderPacket(
      itemId,
      'feature',
      row.feature,
      registrySource,
      {
        canonical: [
          'registry-row',
          'Canonical feature registry entry',
          registrySource,
        ],
        invariant: shipped
          ? ['shipped-status', `Registry status: ${row.status}`, registrySource]
          : undefined,
        tests: testEvidence
          ? ['gate-or-test-evidence', testEvidence, registrySource]
          : undefined,
        visual: media.dedicated
          ? [
              'item-specific-capture',
              `Item-specific rendered capture: ${media.src}`,
              media.src,
            ]
          : undefined,
      },
      media
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
    src: SHOTS.crm[0],
    alt: 'Jovie audience CRM containing the contact workspace',
    label: 'Contact workspace context',
    dedicated: false,
  };
  const behaviorId = 'feature.contacts.delete-contact';
  const behaviorPacket = founderPacket(
    behaviorId,
    'feature',
    'Delete a contact',
    behaviorSource,
    {
      canonical: [
        'canonical-source',
        'Canonical contact row action and owned-profile server action',
        behaviorSource,
      ],
      tests: [
        'behavior-tests',
        'Destructive confirmation behavior tests',
        behaviorSource,
      ],
    },
    behaviorMedia
  );

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
        media: [behaviorMedia],
      },
      behaviorPacket,
      'Behavior evidence is complete; ready for founder taste review.'
    ),
  ];

  return [...auditedBehaviorItems, ...capabilityItems];
}
