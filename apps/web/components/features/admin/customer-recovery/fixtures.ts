import type {
  CustomerRecoveryDossier,
  CustomerRecoveryResult,
} from '@/lib/admin/customer-recovery';

export const recoveryDossier: CustomerRecoveryDossier = {
  identity: {
    displayName: 'Phoebe Bridgers',
    email: 'phoebe@example.com',
    handle: 'phoebe',
    stage: 'claimed',
    sources: ['waitlist', 'creator_profile'],
    userId: 'u1',
    creatorProfileId: 'cp1',
  },
  account: {
    plan: 'pro',
    isPro: true,
    isPaying: true,
  },
  authority: {
    profileClaimed: true,
    isVerified: false,
    ingestionStatus: 'failed',
    lastIngestionError: 'spotify timeout',
    hasSpotifySource: true,
  },
  admission: { status: 'approved' },
  connections: { activeSocialLinks: 4 },
  launch: { releaseCount: 3 },
  recentOperations: [
    {
      type: 'artist-ingest',
      result: 'failed',
      failureReason: 'spotify timeout',
      createdAt: '2026-09-15T00:00:00.000Z',
    },
  ],
  blocker: {
    kind: 'ingestion-failed',
    summary: 'Artist ingestion failed and can be re-run.',
    operation: 'rerun-ingestion',
    preconditionNote: null,
  },
};

export const recoveryResult: CustomerRecoveryResult = {
  search: 'phoebe',
  matches: [],
  dossier: recoveryDossier,
  error: null,
  generatedAt: '2026-10-02T12:00:00.000Z',
};

export const readOnlyDossier: CustomerRecoveryDossier = {
  ...recoveryDossier,
  blocker: {
    kind: 'ingestion-in-flight',
    summary: 'Artist ingestion is already queued or running.',
    operation: null,
    preconditionNote: 'Wait for the current ingestion run to finish.',
  },
};
