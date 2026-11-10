import { describe, expect, it } from 'vitest';
import {
  type CertificationReviewPacket,
  DOGFOOD_JUDGE_VISUAL_PROOF_PREFIX,
  evaluateCertificationAdmission,
} from '@/lib/agent-os/certification';
import { receipt, reviewPacket } from './certification-fixtures';

describe('dogfood judge receipt', () => {
  const judge = (status: 'passed' | 'failed' = 'passed') => ({
    ...receipt(
      'visual_proof',
      `${DOGFOOD_JUDGE_VISUAL_PROOF_PREFIX}feature-proof-library`
    ),
    status,
  });
  const codes = (visualProof: CertificationReviewPacket['visualProof']) =>
    evaluateCertificationAdmission({
      packet: reviewPacket({ visualProof }),
    }).blockers.map(item => item.code);

  it('blocks visual proof that has no judge receipt', () => {
    expect(codes([receipt('visual_proof', 'screenshot')])).toContain(
      'visual_proof_judge_missing'
    );
  });

  it('blocks a failed judge receipt', () => {
    expect(codes([judge('failed')])).toContain('visual_proof_failed');
  });

  it('admits a passing judge receipt', () => {
    const result = codes([receipt('visual_proof', 'screenshot'), judge()]);
    expect(result).not.toContain('visual_proof_judge_missing');
    expect(result).not.toContain('visual_proof_failed');
  });
});
