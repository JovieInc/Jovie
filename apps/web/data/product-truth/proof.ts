import { LOGO_ASSET_REGISTRY } from '@/data/design/logoAssets';
import { MARKETING_ROUTE_MANIFEST } from '@/data/marketing/routeManifest';
import {
  DOGFOOD_RECEIPTS_SCHEMA,
  DOGFOOD_RECEIPTS_SOURCE,
  type DogfoodReceiptsFile,
} from './dogfood';
import dogfoodReceipts from './dogfood-receipts.gen.json';
import {
  DOGFOOD_PROFILE_ROUTES,
  type EvidenceClass,
  type ProofGeneratorId,
} from './evidence';

export const PROOF_KINDS = [
  'logo',
  'quote',
  'metric',
  'product-proof',
  'third-party',
] as const;

export type ProofKind = (typeof PROOF_KINDS)[number];

export const PROOF_STRENGTHS = ['strong', 'moderate', 'weak'] as const;

export type ProofStrength = (typeof PROOF_STRENGTHS)[number];

interface ProofBase {
  readonly recordType: 'proof';
  readonly id: string;
  readonly kind: ProofKind;
  readonly claimId: string;
  /** Omit to make the proof eligible for every section with this claim. */
  readonly sectionIds?: readonly string[];
  /** Audiences the proof speaks to. Omit for audience-neutral proof. */
  readonly audiences?: readonly string[];
  /** Editorial strength, the last ranking key before the stable id. */
  readonly strength?: ProofStrength;
}

export interface LogoPermissionRecord {
  readonly recordId: string;
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly scope: string;
}

export const LOGO_RELATIONSHIPS = ['customer', 'integration', 'press'] as const;

export type LogoRelationship = (typeof LOGO_RELATIONSHIPS)[number];

export interface LogoProof extends ProofBase {
  readonly kind: 'logo';
  readonly brand: string;
  readonly relationship: LogoRelationship;
  readonly permissionRecord: LogoPermissionRecord;
  readonly assetId: string;
  readonly source: typeof LOGO_ASSET_SOURCE;
}

export interface QuoteConsentRecord {
  readonly recordId: string;
  readonly grantedAt: string;
}

export interface QuoteProof extends ProofBase {
  readonly kind: 'quote';
  readonly verbatimText: string;
  readonly personOrRole: string;
  readonly consent: QuoteConsentRecord;
  readonly source: string;
  readonly validUntil: string;
}

export interface MetricSample {
  readonly size: number;
  readonly population: string;
}

export interface MetricProof extends ProofBase {
  readonly kind: 'metric';
  /**
   * Whose outcome this measures: Jovie's own (dogfood) or a real user's
   * (pilot). Omitted means a market fact, never proof that Jovie works.
   */
  readonly evidence?: 'dogfood' | 'pilot';
  readonly value: string | number;
  readonly unit: string;
  readonly reproducingQuery: string;
  readonly measuredAt: string;
  readonly sample: MetricSample;
  readonly source: string;
}

export type ProductProofArtifact =
  | {
      readonly kind: 'screenshot-scenario';
      readonly scenarioId: string;
      readonly route: string;
      /** When the capture was last rendered; drives freshness ranking. */
      readonly capturedAt?: string;
    }
  | { readonly kind: 'route'; readonly route: string }
  | {
      readonly kind: 'cli-output';
      readonly command: string;
      readonly output: string;
    }
  | { readonly kind: 'changelog-entry'; readonly entry: string };

export interface ProductProof extends ProofBase {
  readonly kind: 'product-proof';
  readonly artifact: ProductProofArtifact;
}

export interface ThirdPartyProof extends ProofBase {
  readonly kind: 'third-party';
  readonly url: string;
  readonly publisher: string;
  readonly date: string;
}

export type ProofItem =
  | LogoProof
  | QuoteProof
  | MetricProof
  | ProductProof
  | ThirdPartyProof;

type Candidate<T extends ProofItem, OptionalKeys extends keyof T> = Omit<
  T,
  OptionalKeys
> &
  Partial<Pick<T, OptionalKeys>>;

export type ProofCandidate =
  | Candidate<
      LogoProof,
      'assetId' | 'brand' | 'permissionRecord' | 'relationship' | 'source'
    >
  | Candidate<
      QuoteProof,
      'consent' | 'personOrRole' | 'source' | 'validUntil' | 'verbatimText'
    >
  | Candidate<
      MetricProof,
      'measuredAt' | 'reproducingQuery' | 'sample' | 'source' | 'unit' | 'value'
    >
  | Candidate<ProductProof, 'artifact'>
  | Candidate<ThirdPartyProof, 'date' | 'publisher' | 'url'>;

export type ProofValidationCode =
  | 'expired-quote'
  | 'invalid-date'
  | 'invalid-metric-sample'
  | 'invalid-third-party-url'
  | 'missing-claim-id'
  | 'missing-logo-asset'
  | 'missing-logo-brand'
  | 'missing-logo-permission'
  | 'missing-logo-relationship'
  | 'missing-logo-source'
  | 'missing-metric-measured-at'
  | 'missing-metric-query'
  | 'missing-metric-source'
  | 'missing-metric-unit'
  | 'missing-metric-value'
  | 'missing-product-artifact'
  | 'missing-quote-attribution'
  | 'missing-quote-consent'
  | 'missing-quote-source'
  | 'missing-quote-text'
  | 'missing-quote-valid-until'
  | 'missing-third-party-date'
  | 'missing-third-party-publisher'
  | 'missing-third-party-url';

export interface ProofValidationIssue {
  readonly code: ProofValidationCode;
  readonly proofId: string;
  readonly message: string;
}

export interface ProofValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ProofValidationIssue[];
}

export const LOGO_ASSET_SOURCE =
  'apps/web/data/design/logo-assets.json' as const;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return hasText(value) && !Number.isNaN(Date.parse(value));
}

function issue(
  candidate: Pick<ProofCandidate, 'id'>,
  code: ProofValidationCode,
  message: string
): ProofValidationIssue {
  return { code, proofId: candidate.id, message };
}

function validateLogo(
  candidate: Extract<ProofCandidate, { kind: 'logo' }>
): readonly ProofValidationIssue[] {
  const issues: ProofValidationIssue[] = [];
  if (!hasText(candidate.brand)) {
    issues.push(
      issue(candidate, 'missing-logo-brand', 'Logo brand is required.')
    );
  }
  if (
    !LOGO_RELATIONSHIPS.includes(candidate.relationship as LogoRelationship)
  ) {
    issues.push(
      issue(
        candidate,
        'missing-logo-relationship',
        `Logo relationship must be one of ${LOGO_RELATIONSHIPS.join(', ')}.`
      )
    );
  }
  if (
    !candidate.permissionRecord ||
    !hasText(candidate.permissionRecord.recordId) ||
    !hasText(candidate.permissionRecord.grantedBy) ||
    !isIsoDate(candidate.permissionRecord.grantedAt) ||
    !hasText(candidate.permissionRecord.scope)
  ) {
    issues.push(
      issue(
        candidate,
        'missing-logo-permission',
        'Logo permission must have a record, grantor, date, and scope.'
      )
    );
  }
  if (candidate.source !== LOGO_ASSET_SOURCE) {
    issues.push(
      issue(
        candidate,
        'missing-logo-source',
        `Logo source must be ${LOGO_ASSET_SOURCE}.`
      )
    );
  }
  if (
    !hasText(candidate.assetId) ||
    !LOGO_ASSET_REGISTRY.some(asset => asset.id === candidate.assetId)
  ) {
    issues.push(
      issue(
        candidate,
        'missing-logo-asset',
        'Logo asset must resolve in the logo asset registry.'
      )
    );
  }
  return issues;
}

function validateQuote(
  candidate: Extract<ProofCandidate, { kind: 'quote' }>,
  asOf: string
): readonly ProofValidationIssue[] {
  const issues: ProofValidationIssue[] = [];
  if (!hasText(candidate.verbatimText)) {
    issues.push(
      issue(candidate, 'missing-quote-text', 'Verbatim quote text is required.')
    );
  }
  if (!hasText(candidate.personOrRole)) {
    issues.push(
      issue(
        candidate,
        'missing-quote-attribution',
        'A quote needs a person or role.'
      )
    );
  }
  if (
    !candidate.consent ||
    !hasText(candidate.consent.recordId) ||
    !isIsoDate(candidate.consent.grantedAt)
  ) {
    issues.push(
      issue(
        candidate,
        'missing-quote-consent',
        'Quote consent and its date are required.'
      )
    );
  }
  if (!hasText(candidate.source)) {
    issues.push(
      issue(candidate, 'missing-quote-source', 'Quote source is required.')
    );
  }
  if (!hasText(candidate.validUntil)) {
    issues.push(
      issue(
        candidate,
        'missing-quote-valid-until',
        'Quote validUntil is required.'
      )
    );
  } else if (!isIsoDate(candidate.validUntil)) {
    issues.push(
      issue(candidate, 'invalid-date', 'Quote validUntil must be a date.')
    );
  } else if (Date.parse(candidate.validUntil) < Date.parse(asOf)) {
    issues.push(
      issue(candidate, 'expired-quote', 'Quote consent has expired.')
    );
  }
  return issues;
}

function validateMetric(
  candidate: Extract<ProofCandidate, { kind: 'metric' }>
): readonly ProofValidationIssue[] {
  const issues: ProofValidationIssue[] = [];
  if (
    candidate.value === undefined ||
    (typeof candidate.value === 'string' && !hasText(candidate.value))
  ) {
    issues.push(
      issue(candidate, 'missing-metric-value', 'Metric value is required.')
    );
  }
  if (!hasText(candidate.unit)) {
    issues.push(
      issue(candidate, 'missing-metric-unit', 'Metric unit is required.')
    );
  }
  if (!hasText(candidate.reproducingQuery)) {
    issues.push(
      issue(
        candidate,
        'missing-metric-query',
        'A reproducing metric query is required.'
      )
    );
  }
  if (!isIsoDate(candidate.measuredAt)) {
    issues.push(
      issue(
        candidate,
        'missing-metric-measured-at',
        'Metric measuredAt must be a date.'
      )
    );
  }
  if (
    !candidate.sample ||
    !Number.isInteger(candidate.sample.size) ||
    candidate.sample.size <= 0 ||
    !hasText(candidate.sample.population)
  ) {
    issues.push(
      issue(
        candidate,
        'invalid-metric-sample',
        'Metric sample needs a positive size and population.'
      )
    );
  }
  if (!hasText(candidate.source)) {
    issues.push(
      issue(candidate, 'missing-metric-source', 'Metric source is required.')
    );
  }
  return issues;
}

function validateProductProof(
  candidate: Extract<ProofCandidate, { kind: 'product-proof' }>
): readonly ProofValidationIssue[] {
  const artifact = candidate.artifact;
  const valid =
    artifact !== undefined &&
    ((artifact.kind === 'screenshot-scenario' &&
      hasText(artifact.scenarioId) &&
      hasText(artifact.route)) ||
      (artifact.kind === 'route' && hasText(artifact.route)) ||
      (artifact.kind === 'cli-output' &&
        hasText(artifact.command) &&
        hasText(artifact.output)) ||
      (artifact.kind === 'changelog-entry' && hasText(artifact.entry)));
  return valid
    ? []
    : [
        issue(
          candidate,
          'missing-product-artifact',
          'Product proof needs a screenshot scenario, route, CLI output, or changelog entry.'
        ),
      ];
}

function validateThirdParty(
  candidate: Extract<ProofCandidate, { kind: 'third-party' }>
): readonly ProofValidationIssue[] {
  const issues: ProofValidationIssue[] = [];
  if (!hasText(candidate.url)) {
    issues.push(
      issue(
        candidate,
        'missing-third-party-url',
        'Third-party URL is required.'
      )
    );
  } else {
    try {
      const url = new URL(candidate.url);
      if (url.protocol !== 'https:') throw new Error('not https');
    } catch {
      issues.push(
        issue(
          candidate,
          'invalid-third-party-url',
          'Third-party URL must be an HTTPS URL.'
        )
      );
    }
  }
  if (!hasText(candidate.publisher)) {
    issues.push(
      issue(
        candidate,
        'missing-third-party-publisher',
        'Third-party publisher is required.'
      )
    );
  }
  if (!isIsoDate(candidate.date)) {
    issues.push(
      issue(
        candidate,
        'missing-third-party-date',
        'Third-party date is required.'
      )
    );
  }
  return issues;
}

export function validateProof(
  candidate: ProofCandidate,
  asOf: string
): ProofValidationResult {
  const issues: ProofValidationIssue[] = [];
  if (!hasText(candidate.claimId)) {
    issues.push(
      issue(candidate, 'missing-claim-id', 'Every proof must link to a claim.')
    );
  }

  if (!isIsoDate(asOf)) {
    issues.push(issue(candidate, 'invalid-date', 'Audit date must be valid.'));
  } else if (candidate.kind === 'logo') {
    issues.push(...validateLogo(candidate));
  } else if (candidate.kind === 'quote') {
    issues.push(...validateQuote(candidate, asOf));
  } else if (candidate.kind === 'metric') {
    issues.push(...validateMetric(candidate));
  } else if (candidate.kind === 'product-proof') {
    issues.push(...validateProductProof(candidate));
  } else {
    issues.push(...validateThirdParty(candidate));
  }

  return { valid: issues.length === 0, issues };
}

const VERIFIED_PRODUCT_PROOF = [
  {
    recordType: 'proof',
    id: 'product-profile-subscribe-capture',
    kind: 'product-proof',
    claimId: 'capability.artist-profiles.audience-capture',
    sectionIds: ['relationships', 'feature-split'],
    artifact: {
      kind: 'screenshot-scenario',
      scenarioId: 'tim-white-profile-subscribe-mobile',
      route: '/tim',
    },
  },
  {
    recordType: 'proof',
    id: 'product-profile-pay-capture',
    kind: 'product-proof',
    claimId: 'capability.pay.artist-payment-surface',
    sectionIds: ['relationships', 'feature-split'],
    artifact: {
      kind: 'screenshot-scenario',
      scenarioId: 'tim-white-profile-pay-mobile',
      route: '/tim',
    },
  },
  {
    // Launch kit (offer agent): #20283 merged as 15018865b7, live in prod
    // build 974bf78; jov.ie/api/v1/tim and /openapi.json verified 2026-10-04.
    // Capability proof only: it shows the feature shipped, not an outcome.
    recordType: 'proof',
    id: 'product-agent-profile-api-launch',
    kind: 'product-proof',
    claimId:
      'capability.agent-readable-profile-summary.machine-readable-public-profile-summary',
    artifact: {
      kind: 'changelog-entry',
      entry: 'https://github.com/JovieInc/Jovie/pull/20283',
    },
  },
] as const satisfies readonly ProductProof[];

for (const proof of VERIFIED_PRODUCT_PROOF) {
  const validation = validateProof(proof, '2026-09-30T00:00:00.000Z');
  if (!validation.valid) {
    throw new Error(
      `Invalid registered proof ${proof.id}: ${validation.issues.map(item => item.code).join(', ')}`
    );
  }
}

const DOGFOOD_RECEIPTS = dogfoodReceipts as DogfoodReceiptsFile;
if (DOGFOOD_RECEIPTS.schema !== DOGFOOD_RECEIPTS_SCHEMA) {
  throw new Error(
    `Unexpected dogfood receipts schema ${DOGFOOD_RECEIPTS.schema}`
  );
}

/** Dogfood receipts from `pnpm proof:dogfood`, as measured metric proof. */
export const DOGFOOD_METRIC_PROOF: readonly MetricProof[] =
  DOGFOOD_RECEIPTS.receipts.map(receipt => ({
    recordType: 'proof',
    id: receipt.id,
    kind: 'metric',
    claimId: receipt.claimId,
    evidence: 'dogfood',
    strength: 'weak',
    value: receipt.value,
    unit: receipt.unit,
    reproducingQuery: receipt.reproducingQuery,
    measuredAt: DOGFOOD_RECEIPTS.measuredAt,
    // One profile measured; the event count is the value, not the sample.
    sample: { size: 1, population: receipt.population },
    source: `${DOGFOOD_RECEIPTS_SOURCE}#${receipt.id}`,
  }));

for (const proof of DOGFOOD_METRIC_PROOF) {
  const validation = validateProof(proof, DOGFOOD_RECEIPTS.measuredAt);
  if (!validation.valid) {
    throw new Error(
      `Invalid dogfood receipt ${proof.id}: ${validation.issues.map(item => item.code).join(', ')}`
    );
  }
}

export const PROOF_REGISTRY: readonly ProofItem[] = [
  ...VERIFIED_PRODUCT_PROOF,
  ...DOGFOOD_METRIC_PROOF,
];

/**
 * The evidence class a proof item gives an outcome claim (JOV-7750).
 * Captures of Jovie's own profiles are dogfood; consented quotes and
 * permissioned customer logos come from real users (pilot); metrics carry
 * their class explicitly. Third-party citations and press logos are market
 * facts, not proof that Jovie gets results.
 */
export function proofEvidenceClass(proof: ProofCandidate): EvidenceClass {
  switch (proof.kind) {
    case 'metric':
      return proof.evidence ?? 'none';
    case 'quote':
      return 'pilot';
    case 'logo':
      return proof.relationship === 'customer' ? 'pilot' : 'none';
    case 'product-proof': {
      const artifact = proof.artifact;
      const route =
        artifact?.kind === 'route' || artifact?.kind === 'screenshot-scenario'
          ? artifact.route
          : undefined;
      return route && DOGFOOD_PROFILE_ROUTES.includes(route)
        ? 'dogfood'
        : 'none';
    }
    case 'third-party':
      return 'none';
  }
}

/**
 * Claim-registry adapter: returns the proof items whose claimId is missing
 * from the given set of registered claim ids (the product-truth Claim
 * registry). Empty means every proof links to a real claim.
 */
export function findUnresolvedProofClaims(
  registeredClaimIds: ReadonlySet<string>,
  registry: readonly Pick<ProofItem, 'id' | 'claimId'>[] = PROOF_REGISTRY
): readonly { readonly proofId: string; readonly claimId: string }[] {
  return registry
    .filter(proof => !registeredClaimIds.has(proof.claimId))
    .map(proof => ({ proofId: proof.id, claimId: proof.claimId }));
}

export type ProofRequestLane =
  | 'brand-permission-outreach'
  | 'customer-quote-outreach'
  | 'measurement'
  | 'product-capture'
  | 'third-party-research';

export interface ProofOutreachDraft {
  readonly status: 'queued-for-person';
  readonly autoSend: false;
  readonly subject: string;
  readonly body: string;
}

export interface ProofRequest {
  readonly recordType: 'proof-request';
  readonly kind: ProofKind;
  readonly claimId: string;
  readonly pagesBlocked: readonly string[];
  readonly suggestedLane: ProofRequestLane;
  /** The proof generator that can fill this gap (JOV-7750). */
  readonly generator: ProofGeneratorId;
  readonly outreach?: ProofOutreachDraft;
}

/**
 * Generator per proof kind, in Tim's order: measured product outcomes come
 * from dogfood receipts first; quotes and customer logos need pilot users.
 */
const REQUEST_GENERATOR_BY_KIND: Readonly<Record<ProofKind, ProofGeneratorId>> =
  {
    logo: 'pilot',
    quote: 'pilot',
    metric: 'dogfood',
    'product-proof': 'dogfood',
    'third-party': 'research',
  };

const REQUEST_LANE_BY_KIND: Readonly<Record<ProofKind, ProofRequestLane>> = {
  logo: 'brand-permission-outreach',
  quote: 'customer-quote-outreach',
  metric: 'measurement',
  'product-proof': 'product-capture',
  'third-party': 'third-party-research',
};

function outreachDraft(
  kind: 'logo' | 'quote',
  claimId: string,
  subjectName?: string
): ProofOutreachDraft {
  const subject =
    kind === 'logo'
      ? `Permission to show ${subjectName ?? 'your brand'} on Jovie`
      : `Permission to quote ${subjectName ?? 'you'} on Jovie`;
  const body =
    kind === 'logo'
      ? `We would like to reference ${subjectName ?? 'your brand'} in support of claim ${claimId}. Could you confirm the relationship, approved logo asset, display scope, and permission period?`
      : `We would like to use your exact words in support of claim ${claimId}. Could you confirm the verbatim quote, attribution, source, consent date, and how long the consent remains valid?`;
  return { status: 'queued-for-person', autoSend: false, subject, body };
}

export function createProofRequest(input: {
  readonly kind: ProofKind;
  readonly claimId: string;
  readonly pagesBlocked: readonly string[];
  readonly subjectName?: string;
  /** Overrides the kind's default generator, e.g. a computed claim-time slot. */
  readonly generator?: ProofGeneratorId;
}): ProofRequest {
  const pagesBlocked = [...new Set(input.pagesBlocked)].sort();
  const outreach =
    input.kind === 'logo' || input.kind === 'quote'
      ? outreachDraft(input.kind, input.claimId, input.subjectName)
      : undefined;
  return {
    recordType: 'proof-request',
    kind: input.kind,
    claimId: input.claimId,
    pagesBlocked,
    suggestedLane: REQUEST_LANE_BY_KIND[input.kind],
    generator: input.generator ?? REQUEST_GENERATOR_BY_KIND[input.kind],
    ...(outreach ? { outreach } : {}),
  };
}

export interface ProofPageContext {
  readonly pageId: string;
  readonly asOf: string;
  readonly usedProofIds: Set<string>;
}

export interface ProofSection {
  readonly id: string;
  readonly claimId: string;
  readonly page: ProofPageContext;
  readonly kind: ProofKind;
  readonly fallbackKinds?: readonly ProofKind[];
  /** Audience of the page section; proof aimed at it outranks neutral proof. */
  readonly audience?: string;
}

export function createProofPageContext(
  pageId: string,
  asOf: string
): ProofPageContext {
  if (!hasText(pageId) || !isIsoDate(asOf)) {
    throw new Error(
      'Proof page context needs a page id and deterministic date.'
    );
  }
  return { pageId, asOf, usedProofIds: new Set<string>() };
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** The date a proof was last true: permission, consent, measurement, capture. */
export function proofFreshnessDate(
  candidate: ProofCandidate
): string | undefined {
  switch (candidate.kind) {
    case 'logo':
      return candidate.permissionRecord?.grantedAt;
    case 'quote':
      return candidate.consent?.grantedAt;
    case 'metric':
      return candidate.measuredAt;
    case 'third-party':
      return candidate.date;
    case 'product-proof':
      return candidate.artifact?.kind === 'screenshot-scenario'
        ? candidate.artifact.capturedAt
        : undefined;
  }
}

function freshnessTime(candidate: ProofCandidate): number {
  const date = proofFreshnessDate(candidate);
  return date && isIsoDate(date) ? Date.parse(date) : 0;
}

/** 0 = aimed at this section, 1 = eligible for every section of the claim. */
function sectionRelevance(
  candidate: ProofCandidate,
  section: ProofSection
): number {
  return candidate.sectionIds?.includes(section.id) ? 0 : 1;
}

/** 0 = aimed at this audience, 1 = audience-neutral, 2 = aimed elsewhere. */
function audienceRank(
  candidate: ProofCandidate,
  section: ProofSection
): number {
  if (!candidate.audiences || candidate.audiences.length === 0) return 1;
  if (section.audience && candidate.audiences.includes(section.audience)) {
    return 0;
  }
  return 2;
}

function strengthRank(candidate: ProofCandidate): number {
  return PROOF_STRENGTHS.indexOf(candidate.strength ?? 'moderate');
}

/**
 * Deterministic proof order for one section: requested kind, then claim
 * relevance to the section, then audience match, then freshness (newest
 * first), then strength, then id so ties never depend on registry order.
 */
export function compareProofForSection(
  section: ProofSection,
  kindRank: ReadonlyMap<ProofKind, number>
): (left: ProofCandidate, right: ProofCandidate) => number {
  return (left, right) =>
    (kindRank.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
      (kindRank.get(right.kind) ?? Number.MAX_SAFE_INTEGER) ||
    sectionRelevance(left, section) - sectionRelevance(right, section) ||
    audienceRank(left, section) - audienceRank(right, section) ||
    freshnessTime(right) - freshnessTime(left) ||
    strengthRank(left) - strengthRank(right) ||
    compareText(left.id, right.id);
}

export function selectProof(
  section: ProofSection,
  registry: readonly ProofCandidate[] = PROOF_REGISTRY
): ProofItem | ProofRequest {
  const preferredKinds = [
    ...new Set([section.kind, ...(section.fallbackKinds ?? [])]),
  ];
  const kindRank = new Map(preferredKinds.map((kind, index) => [kind, index]));
  const eligible = registry
    .filter(candidate => candidate.claimId === section.claimId)
    .filter(candidate => !section.page.usedProofIds.has(candidate.id))
    .filter(
      candidate =>
        candidate.sectionIds === undefined ||
        candidate.sectionIds.includes(section.id)
    )
    .filter(candidate => preferredKinds.includes(candidate.kind))
    .filter(candidate => validateProof(candidate, section.page.asOf).valid)
    .sort(compareProofForSection(section, kindRank));

  const selected = eligible[0];
  if (!selected) {
    return createProofRequest({
      kind: section.kind,
      claimId: section.claimId,
      pagesBlocked: [section.page.pageId],
    });
  }

  section.page.usedProofIds.add(selected.id);
  return selected as ProofItem;
}

/**
 * The registry a factory page may select from (JOV-7750): a measured Jovie
 * outcome claim keeps only proof with admissible evidence, so a market fact
 * can never back it and selectProof returns a ProofRequest instead.
 */
export function admissibleProofRegistry(
  measuredClaimIds: ReadonlySet<string>,
  registry: readonly ProofCandidate[] = PROOF_REGISTRY
): readonly ProofCandidate[] {
  return registry.filter(
    proof =>
      !measuredClaimIds.has(proof.claimId) ||
      proofEvidenceClass(proof) !== 'none'
  );
}

/**
 * The ProofRequest loop's landing check (JOV-7750). Given the requests a
 * factory run recorded, returns the pages whose proof has since landed: a
 * valid registry item now exists for the request's claim and kind, with
 * admissible evidence. The JOV-7765 rework loop re-renders those pages from
 * the proof stage; nothing else re-runs.
 */
export function findProofReadyPages(
  requests: readonly Pick<ProofRequest, 'claimId' | 'kind' | 'pagesBlocked'>[],
  asOf: string,
  registry: readonly ProofCandidate[] = PROOF_REGISTRY
): readonly {
  readonly pageId: string;
  readonly claimIds: readonly string[];
}[] {
  const landed = (request: (typeof requests)[number]) =>
    registry.some(
      candidate =>
        candidate.claimId === request.claimId &&
        candidate.kind === request.kind &&
        proofEvidenceClass(candidate) !== 'none' &&
        validateProof(candidate, asOf).valid
    );
  const byPage = new Map<string, Set<string>>();
  for (const request of requests) {
    if (!landed(request)) continue;
    for (const pageId of request.pagesBlocked) {
      const claims = byPage.get(pageId) ?? new Set<string>();
      claims.add(request.claimId);
      byPage.set(pageId, claims);
    }
  }
  return [...byPage.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([pageId, claims]) => ({ pageId, claimIds: [...claims].sort() }));
}

export interface MarketingProofAuditObservation {
  readonly id: string;
  readonly kind: ProofKind;
  readonly claimId: string;
  readonly pages: readonly string[];
  readonly observedValue: string;
  readonly sourceLocation: string;
  readonly subjectName?: string;
  readonly missing: readonly string[];
}

export interface MarketingProofBaselineItem
  extends MarketingProofAuditObservation {
  readonly request: ProofRequest;
}

const TRUST_LOGO_PAGES = [
  '/artist-notifications',
  '/artist-profile',
  '/artist-profiles',
  '/new',
  '/pricing',
  '/solutions/artists',
] as const;

const UNVERIFIED_MARKETING_PROOF: readonly MarketingProofAuditObservation[] = [
  ...LOGO_ASSET_REGISTRY.map(asset => ({
    id: `baseline-logo-${asset.id}`,
    kind: 'logo' as const,
    claimId: `relationship.logo.${asset.id}`,
    pages: TRUST_LOGO_PAGES,
    observedValue: asset.id,
    sourceLocation: LOGO_ASSET_SOURCE,
    subjectName: asset.id,
    missing: ['relationship', 'permissionRecord'],
  })),
  {
    // The tour capture stays as an image, but no events or ticketing
    // capability backs the "Sell Out" outcome, so it is not proof of it.
    id: 'baseline-sell-out-tour-capture',
    kind: 'product-proof',
    claimId: 'capability.events.ticket-sales',
    pages: ['/', '/artist-profile', '/artist-profiles', '/solutions/artists'],
    observedValue: 'Sell Out outcome shown with tim-white-profile-tour-mobile',
    sourceLocation: 'apps/web/data/artistProfileCopy.ts',
    missing: ['registered events or ticketing claim'],
  },
  {
    id: 'baseline-about-founder-experience',
    kind: 'metric',
    claimId: 'about.founder.experience-years',
    pages: ['/about'],
    observedValue: '15+ years',
    sourceLocation: 'apps/web/data/aboutCopy.ts',
    missing: ['reproducingQuery', 'measuredAt', 'sample', 'source'],
  },
  {
    id: 'baseline-launch-tracks-generated',
    kind: 'metric',
    claimId: 'launch.market.tracks-generated-daily',
    pages: ['/launch'],
    observedValue: '7M tracks generated per day on Suno alone',
    sourceLocation: 'apps/web/app/(marketing)/launch/page.tsx',
    missing: ['reproducingQuery', 'measuredAt', 'sample', 'source'],
  },
  {
    id: 'baseline-launch-ai-market',
    kind: 'metric',
    claimId: 'launch.market.ai-music-2034',
    pages: ['/launch'],
    observedValue: '$60.4B projected AI music market by 2034',
    sourceLocation: 'apps/web/app/(marketing)/launch/page.tsx',
    missing: ['reproducingQuery', 'measuredAt', 'sample', 'source'],
  },
  {
    id: 'baseline-launch-fan-ltv',
    kind: 'metric',
    claimId: 'launch.market.owned-fan-ltv',
    pages: ['/launch'],
    observedValue: '$100 estimated lifetime value per owned fan relationship',
    sourceLocation: 'apps/web/app/(marketing)/launch/page.tsx',
    missing: ['reproducingQuery', 'measuredAt', 'sample', 'source'],
  },
  {
    id: 'baseline-launch-demo-audience-metrics',
    kind: 'metric',
    claimId: 'launch.product-demo.audience-metrics',
    pages: ['/launch'],
    observedValue: '2,847 views; 1,392 visitors; 214 subscribers',
    sourceLocation: 'apps/web/app/(marketing)/launch/page.tsx',
    missing: ['reproducingQuery', 'measuredAt', 'sample', 'source'],
  },
] as const;

const AUDITED_MARKETING_PAGES = [
  ...new Set(
    MARKETING_ROUTE_MANIFEST.filter(entry => entry.status === 'active').map(
      entry => entry.url
    )
  ),
].sort();

export const MARKETING_PROOF_AUDIT_BASELINE = {
  schemaVersion: 'marketing-proof-audit/v1',
  auditedAt: '2026-09-30T00:00:00.000Z',
  auditedPages: AUDITED_MARKETING_PAGES,
  items: UNVERIFIED_MARKETING_PROOF.map(
    (observation): MarketingProofBaselineItem => ({
      ...observation,
      request: createProofRequest({
        kind: observation.kind,
        claimId: observation.claimId,
        pagesBlocked: observation.pages,
        subjectName: observation.subjectName,
      }),
    })
  ),
} as const;
