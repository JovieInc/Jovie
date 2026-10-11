import type { FounderReviewItem } from '@/lib/admin/founder-review-registry';
import {
  buildCertificationDecisionDigest,
  JOVIE_CERTIFICATION_CONTRACT,
} from '@/lib/agent-os/certification';

export function founderReviewItemFixture(
  overrides: Partial<FounderReviewItem> &
    Pick<FounderReviewItem, 'id' | 'title' | 'readiness'>
): FounderReviewItem {
  const subject = {
    id: overrides.id,
    kind: 'feature' as const,
    title: overrides.title,
  };
  const certificationPacket = {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    subject,
    source: null,
    canonicalReferences: [],
    invariantEvaluation: [],
    testsCoverage: [],
    visualProof: [],
    requiredVariants: [],
    itemMedia: [],
  };
  return {
    registry: 'feature',
    eyebrow: 'Smart Links',
    scope: 'capability',
    description: 'A source-backed capability with dedicated evidence.',
    status: 'Shipped',
    access: 'Free+',
    source: 'docs/FEATURE_REGISTRY.md',
    gate: 'None',
    readinessReason: 'The review packet is complete.',
    media: [],
    certificationPacket,
    decisionEvidenceDigest:
      buildCertificationDecisionDigest(certificationPacket),
    certificationState:
      overrides.readiness === 'ready' ? 'review_ready' : 'working',
    ...overrides,
  };
}
