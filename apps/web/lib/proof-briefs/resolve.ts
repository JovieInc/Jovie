import type { CertifiedProofBrief } from './contract';
import {
  CERTIFIED_PROOF_BRIEF,
  INSUFFICIENT_EVIDENCE_PROOF_BRIEF,
} from './fixture';
import { LYB_FIXTURE_PROOF_BRIEF, LYB_INSUFFICIENT_PROOF_BRIEF } from './lyb';

const CERTIFIED_BRIEFS = new Map(
  [
    CERTIFIED_PROOF_BRIEF,
    INSUFFICIENT_EVIDENCE_PROOF_BRIEF,
    LYB_FIXTURE_PROOF_BRIEF,
    LYB_INSUFFICIENT_PROOF_BRIEF,
  ].map(brief => [brief.briefId, brief])
);

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
