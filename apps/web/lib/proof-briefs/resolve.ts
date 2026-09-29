import type { CertifiedProofBrief } from './contract';
import { CERTIFIED_PROOF_BRIEF } from './fixture';

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
  if (briefId !== CERTIFIED_PROOF_BRIEF.briefId) {
    return null;
  }
  if (revision != null && revision !== CERTIFIED_PROOF_BRIEF.revision) {
    return null;
  }
  return CERTIFIED_PROOF_BRIEF;
}
