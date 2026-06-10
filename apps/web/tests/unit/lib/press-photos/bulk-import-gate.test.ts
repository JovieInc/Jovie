import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAppFlagValue: vi.fn(),
  evaluateBulkPressPhotoActivationEvidence: vi.fn(),
  ingestDspPressPhotos: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: mocks.getAppFlagValue,
}));

vi.mock('@/lib/press-photos/activation-evidence', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/press-photos/activation-evidence')
    >();
  return {
    ...actual,
    evaluateBulkPressPhotoActivationEvidence:
      mocks.evaluateBulkPressPhotoActivationEvidence,
  };
});

vi.mock('@/lib/dsp-enrichment/jobs/press-photo-ingestion', () => ({
  ingestDspPressPhotos: mocks.ingestDspPressPhotos,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.dbSelect,
  },
}));

function mockProfileOwners(): void {
  mocks.dbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              userId: 'user-123',
              clerkUserId: 'clerk-123',
            },
          ]),
        }),
      }),
    }),
  });
}

function buildActivationEvaluation(passed: boolean) {
  return {
    passed,
    reason: passed
      ? 'manual_upload_volume'
      : 'insufficient_manual_upload_volume',
    evidence: {
      lookbackDays: 30,
      manualUploadCount: passed ? 25 : 0,
      manualUploadProfiles: passed ? 10 : 0,
      profilesWithMultipleManualPressPhotos: 0,
      ingestedDraftCount: 0,
      avatarCandidateProfiles: 12,
    },
    thresholds: {
      minManualUploadCount: 20,
      minManualUploadProfiles: 8,
      minProfilesWithMultipleManualPressPhotos: 5,
    },
  };
}

describe('bulk press-photo import gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileOwners();
    mocks.ingestDspPressPhotos.mockResolvedValue({
      creatorProfileId: 'profile-123',
      photosIngested: 2,
      photosSkipped: 0,
      errors: [],
    });
  });

  it('blocks when the feature flag is disabled', async () => {
    mocks.getAppFlagValue.mockResolvedValue(false);
    mocks.evaluateBulkPressPhotoActivationEvidence.mockResolvedValue(
      buildActivationEvaluation(true)
    );

    const { evaluateBulkPressPhotoImportGate } = await import(
      '@/lib/press-photos/bulk-import-gate'
    );
    const evaluation = await evaluateBulkPressPhotoImportGate({
      clerkUserId: 'clerk-123',
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toBe('feature_flag_disabled');
  });

  it('blocks when activation evidence is missing', async () => {
    mocks.getAppFlagValue.mockResolvedValue(true);
    mocks.evaluateBulkPressPhotoActivationEvidence.mockResolvedValue(
      buildActivationEvaluation(false)
    );

    const { evaluateBulkPressPhotoImportGate } = await import(
      '@/lib/press-photos/bulk-import-gate'
    );
    const evaluation = await evaluateBulkPressPhotoImportGate({
      clerkUserId: 'clerk-123',
    });

    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toBe('activation_evidence_missing');
  });

  it('schedules ingestion only when the gate passes', async () => {
    mocks.getAppFlagValue.mockResolvedValue(true);
    mocks.evaluateBulkPressPhotoActivationEvidence.mockResolvedValue(
      buildActivationEvaluation(true)
    );

    const { scheduleBulkPressPhotoImportIfEligible } = await import(
      '@/lib/press-photos/schedule-bulk-import'
    );

    const result = await scheduleBulkPressPhotoImportIfEligible({
      creatorProfileId: 'profile-123',
      trigger: 'test',
    });

    expect(result.scheduled).toBe(true);
    expect(result.photosIngested).toBe(2);
    expect(mocks.ingestDspPressPhotos).toHaveBeenCalledWith(
      'profile-123',
      'user-123',
      'clerk-123'
    );
  });

  it('skips ingestion when the gate blocks', async () => {
    mocks.getAppFlagValue.mockResolvedValue(false);
    mocks.evaluateBulkPressPhotoActivationEvidence.mockResolvedValue(
      buildActivationEvaluation(true)
    );

    const { scheduleBulkPressPhotoImportIfEligible } = await import(
      '@/lib/press-photos/schedule-bulk-import'
    );

    const result = await scheduleBulkPressPhotoImportIfEligible({
      creatorProfileId: 'profile-123',
      trigger: 'test',
    });

    expect(result.scheduled).toBe(false);
    expect(result.gateReason).toBe('feature_flag_disabled');
    expect(mocks.ingestDspPressPhotos).not.toHaveBeenCalled();
  });
});
