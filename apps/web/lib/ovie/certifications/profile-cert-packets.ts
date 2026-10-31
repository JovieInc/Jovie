import { JOVIE_CERTIFICATION_CONTRACT } from '@/lib/agent-os/certification';
import type { ProfileCertLedger } from '@/lib/waitlist/profile-certification';
import type { CertificationPacketFile } from './packet-files.server';

const EVIDENCE_STATUS = {
  passed: 'passed',
  failed: 'failed',
  needs_artist_confirmation: 'blocked',
} as const;

/**
 * Project per-profile waitlist certifications (the waitlist gate) into the
 * packet-file shape the Ovie certifications inventory already renders, under
 * Public Profiles. Handle and check summaries only; no email or other PII.
 */
export function profileCertPacketFiles(
  ledger: ProfileCertLedger
): CertificationPacketFile[] {
  return Object.values(ledger.profiles).map(record => {
    const receipt = record.latest;
    const failed = receipt.checks.filter(c => c.status === 'failed');
    const summary =
      receipt.status === 'passed'
        ? `${receipt.checks.filter(c => c.status === 'passed').length} profile checks passed (${receipt.trigger}).`
        : `${receipt.status}: ${failed.map(c => `${c.id} (${c.summary})`).join('; ')}`.slice(
            0,
            1_900
          );
    const links = [
      ...(receipt.evidence?.videoUrl
        ? [
            {
              label: 'Walk video',
              href: receipt.evidence.videoUrl,
              kind: 'test_run' as const,
            },
          ]
        : []),
    ];
    return {
      domain: 'public_profiles',
      surface: `Waitlist profile ${receipt.profileId.slice(0, 8)}`,
      owner: null,
      packetUpdatedAt: receipt.endedAt,
      links,
      packet: {
        contract: JOVIE_CERTIFICATION_CONTRACT,
        subject: {
          id: `waitlist-profile:${receipt.profileId}`,
          kind: 'production-surface',
          title: `Waitlist profile ${receipt.profileId.slice(0, 8)}`,
        },
        source: {
          repository: 'JovieInc/Jovie',
          ref: 'production',
          sha: receipt.sha ?? 'unknown',
          paths: [],
          digest: null,
        },
        canonicalReferences: [],
        invariantEvaluation: [],
        testsCoverage: [],
        visualProof: [],
        requiredVariants: [],
        itemMedia: [],
        operational: {
          runtimeDogfood: [
            {
              id: `waitlist-profile:${receipt.profileId}:${(receipt.sha ?? 'unknown').slice(0, 8)}`,
              tier: 'runtime_dogfood',
              status: EVIDENCE_STATUS[receipt.status],
              sourceSha: receipt.sha ?? 'unknown',
              ref: 'waitlist-profile-certification',
              digest: null,
              summary,
            },
          ],
        },
      },
      file: `ledger:waitlist-profiles/${receipt.profileId}`,
    } satisfies CertificationPacketFile;
  });
}
