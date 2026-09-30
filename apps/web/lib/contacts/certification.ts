import { createHash } from 'node:crypto';

export const CONTACT_EVIDENCE_DECISIONS = ['yes', 'no', 'unsure'] as const;
export type ContactEvidenceDecision =
  (typeof CONTACT_EVIDENCE_DECISIONS)[number];

export type ContactEvidenceCategory =
  | 'identity'
  | 'dsp'
  | 'catalog'
  | 'destinations'
  | 'social'
  | 'websites'
  | 'search'
  | 'facts'
  | 'conflicts'
  | 'coverage';

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
  readonly decision: ContactEvidenceDecision | null;
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
  readonly evidenceRevision: string;
  readonly status: ContactCertificationStatus;
  readonly coverage: ContactEvidenceCoverage;
  readonly canCertify: boolean;
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
  readonly items: readonly ContactEvidenceItem[];
  readonly sourceClassesChecked: readonly string[];
  readonly requiredSourceClasses: readonly string[];
  readonly certifiedRevision?: string | null;
}): ContactCertificationInspection {
  const checked = [...new Set(input.sourceClassesChecked)].sort();
  const missing = input.requiredSourceClasses.filter(
    sourceClass => !checked.includes(sourceClass)
  );
  const material = input.items;
  const machineResolved = (item: ContactEvidenceItem) =>
    item.decision === null &&
    item.category !== 'conflicts' &&
    item.category !== 'coverage' &&
    item.freshness === 'fresh' &&
    item.confidence !== null &&
    item.confidence >= HIGH_CONFIDENCE;
  const rejected = material.filter(item => item.decision === 'no').length;
  const confirmed = material.filter(
    item => item.decision === 'yes' || machineResolved(item)
  ).length;
  const unresolved = material.length - confirmed - rejected;
  const conflicts = material.filter(
    item => item.category === 'conflicts' && item.decision !== 'no'
  ).length;

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
  const status: ContactCertificationStatus =
    certified && canCertify
      ? 'certified_for_outreach'
      : stale > 0 || Boolean(input.certifiedRevision)
        ? 'stale'
        : conflicts > 0
          ? 'conflicted'
          : unresolved > 0 || missing.length > 0
            ? 'needs_review'
            : material.length > 0
              ? 'human_reviewed'
              : 'machine_scanning';

  return {
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
    items: input.items,
  };
}
