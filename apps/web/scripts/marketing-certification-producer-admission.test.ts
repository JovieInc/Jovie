import { describe, expect, it } from 'vitest';
import { evaluateCertificationAdmission } from '@/lib/agent-os/certification';
import { packetFor } from './marketing-certification-producer.fixtures';

describe('marketing certification producer admission', () => {
  it('a fully evidenced entry is admitted as machine-passed review_ready', () => {
    const base = packetFor();
    // The producer never fabricates a judge receipt (fail closed): without
    // one the kernel blocks until a real dogfood-judge receipt is attached.
    const withoutJudge = evaluateCertificationAdmission({
      packet: base,
      evaluatedAt: '2026-09-28T01:00:00.000Z',
    });
    expect(withoutJudge.blockers.map(item => item.code)).toEqual([
      'visual_proof_judge_missing',
    ]);
    const admission = evaluateCertificationAdmission({
      packet: {
        ...base,
        visualProof: [
          ...base.visualProof,
          {
            ...base.visualProof[0],
            id: 'dogfood-judge:shell.footer',
            ref: `dogfood-judge:shell.footer@sha256:${'a'.repeat(32)}`,
          },
        ],
      },
      evaluatedAt: '2026-09-28T01:00:00.000Z',
    });
    expect(admission.blockers).toEqual([]);
    expect(admission.state).toBe('review_ready');
  });
});
