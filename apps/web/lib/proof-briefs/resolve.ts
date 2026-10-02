import {
  assertProofBriefRenderable,
  type CertifiedProofBrief,
  type ProofBriefAudience,
  proofBriefBrand,
} from './contract';
import {
  CERTIFIED_PROOF_BRIEF,
  INSUFFICIENT_EVIDENCE_PROOF_BRIEF,
  INVESTOR_PROOF_BRIEF,
} from './fixture';
import { LYB_FIXTURE_PROOF_BRIEF, LYB_INSUFFICIENT_PROOF_BRIEF } from './lyb';

const CERTIFIED_BRIEFS = new Map(
  [
    CERTIFIED_PROOF_BRIEF,
    INSUFFICIENT_EVIDENCE_PROOF_BRIEF,
    INVESTOR_PROOF_BRIEF,
    LYB_FIXTURE_PROOF_BRIEF,
    LYB_INSUFFICIENT_PROOF_BRIEF,
  ].map(brief => [brief.briefId, brief])
);

/**
 * Briefs without an explicit audience tag are subject-scoped recaps; they
 * are never served to investor/founder/internal requests.
 */
const DEFAULT_BRIEF_AUDIENCES: readonly ProofBriefAudience[] = [
  'customer',
  'manager',
];

/**
 * Resolve a certified proof brief by id (+optional revision pin). The
 * certified store ships in the persistence slice; today the canonical
 * certified fixture is the only resolvable brief, which keeps every surface
 * deterministic end to end.
 */
export function resolveCertifiedProofBrief(
  briefId: string,
  revision?: number
): CertifiedProofBrief | null {
  const brief = CERTIFIED_BRIEFS.get(briefId);
  if (!brief || (revision != null && revision !== brief.revision)) {
    return null;
  }
  return brief;
}

/**
 * Most recent certified brief eligible for an audience — the "send me an
 * investor card" path. Stale or unrenderable snapshots are skipped rather
 * than surfaced.
 */
export function resolveLatestCertifiedProofBrief(
  audience: ProofBriefAudience,
  options: { readonly now?: Date; readonly product?: string } = {}
): CertifiedProofBrief | null {
  const now = options.now ?? new Date();
  const product = options.product ?? 'Jovie';
  const eligible = [...CERTIFIED_BRIEFS.values()]
    .filter(brief => proofBriefBrand(brief).product === product)
    .filter(brief =>
      (brief.audiences ?? DEFAULT_BRIEF_AUDIENCES).includes(audience)
    )
    .filter(brief => {
      try {
        assertProofBriefRenderable(brief, { now });
        return true;
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        b.generatedAt.localeCompare(a.generatedAt) || b.revision - a.revision
    );
  return eligible[0] ?? null;
}
