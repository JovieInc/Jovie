import { afterEach, describe, expect, it } from 'vitest';

import {
  type BulkPressPhotoActivationEvidence,
  DEFAULT_ACTIVATION_EVIDENCE_THRESHOLDS,
  evaluateActivationEvidence,
} from '@/lib/press-photos/activation-evidence';

const BASE_EVIDENCE: BulkPressPhotoActivationEvidence = {
  lookbackDays: 30,
  manualUploadCount: 0,
  manualUploadProfiles: 0,
  profilesWithMultipleManualPressPhotos: 0,
  ingestedDraftCount: 0,
  avatarCandidateProfiles: 0,
};

describe('bulk press-photo activation evidence', () => {
  afterEach(() => {
    delete process.env.BULK_PRESS_PHOTO_IMPORT_EVIDENCE_OVERRIDE;
  });

  it('fails when manual upload volume is below threshold', () => {
    const evaluation = evaluateActivationEvidence({
      ...BASE_EVIDENCE,
      manualUploadCount: 4,
      manualUploadProfiles: 2,
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.reason).toBe('insufficient_manual_upload_volume');
  });

  it('passes when manual upload volume crosses the threshold', () => {
    const evaluation = evaluateActivationEvidence({
      ...BASE_EVIDENCE,
      manualUploadCount:
        DEFAULT_ACTIVATION_EVIDENCE_THRESHOLDS.minManualUploadCount,
      manualUploadProfiles:
        DEFAULT_ACTIVATION_EVIDENCE_THRESHOLDS.minManualUploadProfiles,
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.reason).toBe('manual_upload_volume');
  });

  it('passes on multi-photo migration signal even with low total volume', () => {
    const evaluation = evaluateActivationEvidence({
      ...BASE_EVIDENCE,
      profilesWithMultipleManualPressPhotos:
        DEFAULT_ACTIVATION_EVIDENCE_THRESHOLDS.minProfilesWithMultipleManualPressPhotos,
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.reason).toBe('multi_photo_migration_signal');
  });

  it('reports insufficient migration signal when some multi-photo demand exists', () => {
    const evaluation = evaluateActivationEvidence({
      ...BASE_EVIDENCE,
      profilesWithMultipleManualPressPhotos: 2,
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.reason).toBe('insufficient_migration_signal');
  });

  it('honors the non-prod evidence override', () => {
    process.env.BULK_PRESS_PHOTO_IMPORT_EVIDENCE_OVERRIDE = 'passed';

    const evaluation = evaluateActivationEvidence(BASE_EVIDENCE);

    expect(evaluation.passed).toBe(true);
    expect(evaluation.reason).toBe('override_passed');
  });
});
