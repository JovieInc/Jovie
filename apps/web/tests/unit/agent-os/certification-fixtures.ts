import {
  type CertificationEvidenceReceipt,
  type CertificationReviewPacket,
  DOGFOOD_JUDGE_VISUAL_PROOF_PREFIX,
} from '@/lib/agent-os/certification';

export const SOURCE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const CHANGED_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
export function receipt(
  tier: CertificationEvidenceReceipt['tier'],
  id: string = tier,
  sourceSha: string | null = SOURCE_SHA
): CertificationEvidenceReceipt {
  return {
    digest: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    id,
    ref: `github:JovieInc/Jovie/${id}`,
    sourceSha,
    status: 'passed',
    summary: `${tier} passed`,
    tier,
  };
}
export function reviewPacket(
  overrides: Partial<CertificationReviewPacket> = {}
): CertificationReviewPacket {
  return {
    canonicalReferences: [
      receipt('canonical_references', 'design-canon-reference'),
    ],
    contract: 'jovie.certification/v1',
    invariantEvaluation: [
      receipt('invariant_evaluation', 'invariant-evaluation'),
    ],
    itemMedia: [
      {
        digest:
          'sha256:media00000000000000000000000000000000000000000000000000000',
        id: 'variant-a-proof-video',
        itemId: 'feature-proof-library-row',
        ref: 'github:JovieInc/Jovie/actions/runs/visual-proof',
        sourceSha: SOURCE_SHA,
        status: 'passed',
        summary: 'Variant A proof video captured the item-specific state.',
        variantId: 'variant-a',
      },
    ],
    operational: {},
    requiredVariants: [
      {
        id: 'variant-a',
        label: 'Registry card with proof video',
        proof: receipt('required_variants', 'variant-a-proof'),
        requiredMediaIds: ['variant-a-proof-video'],
        sourceSha: SOURCE_SHA,
      },
    ],
    source: {
      digest:
        'sha256:source0000000000000000000000000000000000000000000000000000',
      expectedSha: SOURCE_SHA,
      paths: ['apps/web/lib/agent-os/certification.ts'],
      ref: 'refs/heads/tim/jov-5753',
      repository: 'JovieInc/Jovie',
      sha: SOURCE_SHA,
    },
    subject: {
      id: 'feature-proof-library',
      kind: 'ovie-registry-projection',
      title: 'Feature Proof Library',
    },
    testsCoverage: [receipt('tests_coverage', 'focused-vitest-coverage')],
    visualProof: [
      receipt('visual_proof', 'item-specific-visual-proof'),
      receipt(
        'visual_proof',
        `${DOGFOOD_JUDGE_VISUAL_PROOF_PREFIX}feature-proof-library`
      ),
    ],
    ...overrides,
  };
}
