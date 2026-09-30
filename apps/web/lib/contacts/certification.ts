import { createHash } from 'node:crypto';

export const CONTACT_EVIDENCE_DECISIONS = ['yes', 'no', 'unsure'] as const;
export type ContactEvidenceDecision =
  (typeof CONTACT_EVIDENCE_DECISIONS)[number];

export const CONTACT_EVIDENCE_CATEGORIES = [
  'identity',
  'dsp',
  'catalog',
  'destinations',
  'social',
  'websites',
  'search',
  'facts',
  'conflicts',
  'coverage',
] as const;
export type ContactEvidenceCategory =
  (typeof CONTACT_EVIDENCE_CATEGORIES)[number];

export type ContactEvidenceFreshness = 'fresh' | 'stale' | 'unknown';
export type ContactCertificationStatus =
  | 'machine_scanning'
  | 'needs_review'
  | 'conflicted'
  | 'human_reviewed'
  | 'certified_for_outreach'
  | 'stale';

export interface ContactEvidenceItem {
  readonly key: string;
  readonly revision: string;
  readonly category: ContactEvidenceCategory;
  readonly label: string;
  readonly value: string;
  readonly url: string | null;
  readonly source: string;
  readonly observedAt: string | null;
  readonly confidence: number | null;
  readonly rationale: string;
  readonly freshness: ContactEvidenceFreshness;
  readonly material: boolean;
  readonly correctable: boolean;
  readonly decision: ContactEvidenceDecision | null;
  readonly correction: string | null;
}

export interface ContactEvidenceCoverage {
  readonly confirmed: number;
  readonly rejected: number;
  readonly unresolved: number;
  readonly stale: number;
  readonly sourceClassesChecked: readonly string[];
  readonly missingSourceClasses: readonly string[];
}

export interface ContactCertificationInspection {
  readonly dedupeKey: string;
  readonly evidenceRevision: string;
  readonly status: ContactCertificationStatus;
  readonly coverage: ContactEvidenceCoverage;
  readonly canCertify: boolean;
  readonly certifiedAt: string | null;
  readonly items: readonly ContactEvidenceItem[];
}

const HIGH_CONFIDENCE = 0.9;

export function evidenceDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function evidenceFreshness(
  observedAt: Date | null,
  now: Date,
  staleAfterMs = 30 * 24 * 60 * 60 * 1000
): ContactEvidenceFreshness {
  if (!observedAt) return 'unknown';
  return now.getTime() - observedAt.getTime() > staleAfterMs
    ? 'stale'
    : 'fresh';
}

export function deriveContactCertification(input: {
  readonly dedupeKey: string;
  readonly items: readonly ContactEvidenceItem[];
  readonly sourceClassesChecked: readonly string[];
  readonly requiredSourceClasses: readonly string[];
  readonly certifiedRevision?: string | null;
  readonly certifiedAt?: string | null;
}): ContactCertificationInspection {
  const checked = [...new Set(input.sourceClassesChecked)].sort();
  const missing = input.requiredSourceClasses.filter(
    sourceClass => !checked.includes(sourceClass)
  );
  const material = input.items.filter(item => item.material);
  let confirmed = 0;
  let rejected = 0;
  let unresolved = 0;
  let conflicts = 0;

  for (const item of material) {
    if (item.decision === 'no') {
      rejected += 1;
      continue;
    }
    if (item.decision === 'yes') {
      confirmed += 1;
      if (item.category === 'conflicts') conflicts += 1;
      continue;
    }
    const machineResolved =
      item.decision === null &&
      item.category !== 'conflicts' &&
      item.category !== 'coverage' &&
      item.freshness === 'fresh' &&
      item.confidence !== null &&
      item.confidence >= HIGH_CONFIDENCE;
    if (machineResolved) confirmed += 1;
    else unresolved += 1;
    if (item.category === 'conflicts') conflicts += 1;
  }

  const stale = material.filter(item => item.freshness === 'stale').length;
  const evidenceRevision = evidenceDigest({
    items: material.map(item => [item.key, item.revision]).sort(),
    checked,
    missing,
  });
  const canCertify =
    material.length > 0 &&
    unresolved === 0 &&
    conflicts === 0 &&
    stale === 0 &&
    missing.length === 0;
  const certified = input.certifiedRevision === evidenceRevision;
  const hasHumanReview = material.some(item => item.decision !== null);

  let status: ContactCertificationStatus = 'machine_scanning';
  if (certified && canCertify) status = 'certified_for_outreach';
  else if (stale > 0 || Boolean(input.certifiedRevision)) status = 'stale';
  else if (conflicts > 0) status = 'conflicted';
  else if (unresolved > 0 || missing.length > 0) status = 'needs_review';
  else if (hasHumanReview || material.length > 0) status = 'human_reviewed';

  return {
    dedupeKey: input.dedupeKey,
    evidenceRevision,
    status,
    coverage: {
      confirmed,
      rejected,
      unresolved,
      stale,
      sourceClassesChecked: checked,
      missingSourceClasses: missing,
    },
    canCertify,
    certifiedAt: certified ? (input.certifiedAt ?? null) : null,
    items: input.items,
  };
}
