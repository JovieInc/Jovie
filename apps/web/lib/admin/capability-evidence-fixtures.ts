import type { CapabilityEvidenceRecord } from './capability-evidence-model';

// Synthetic display fixtures; these are not deployment or usage receipts.
export const CAPABILITY_EVIDENCE_FIXTURE: CapabilityEvidenceRecord = {
  capabilityId: 'public-profile-pages',
  subjectId: 'feature.profile.public-profile-pages',
  title: 'Public profile pages',
  goldenPath: 'A visitor opens a public profile and taps a link.',
  certification: {
    state: 'review_ready',
    readiness: 'ready',
    decisionEvidenceDigest: 'a'.repeat(40),
    sourcePath: 'docs/FEATURE_REGISTRY.md',
  },
  deployment: {
    commitSha: 'b'.repeat(40),
    version: '1.2.3',
    environment: 'production',
    deploymentId: 'story-deployment',
  },
  rollout: { gate: null, configuredPercent: null },
  clientSha: null,
  exposure: {
    measured: true,
    count: 128,
    latestAt: '2026-10-02',
    stale: false,
    windowDays: 7,
    population: 'public claimed profiles owned by non-internal accounts',
    error: null,
  },
  outcome: {
    measured: true,
    count: 41,
    latestAt: '2026-10-02',
    stale: false,
    windowDays: 7,
    population: 'public claimed profiles; bot-filtered link taps',
    error: null,
  },
  generatedAt: '2026-10-02T00:00:00.000Z',
};
