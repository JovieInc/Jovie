import type { CertificationEvidenceReceipt } from '@/lib/agent-os/certification';

export const CUSTOMER_SHA = 'a'.repeat(40);

export function customerProof(
  tier: CertificationEvidenceReceipt['tier']
): CertificationEvidenceReceipt {
  return {
    id: tier,
    tier,
    status: 'passed',
    sourceSha: CUSTOMER_SHA,
    ref: `fixture:${tier}`,
    digest: `fixture-digest:${tier}`,
    summary: 'Synthetic test evidence only',
  };
}
