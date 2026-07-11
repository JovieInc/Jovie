import { describe, expect, it } from 'vitest';
import { PROPOSED_SECTIONS } from '@/data/marketing';
import {
  DesignGapRecordSchema,
  DesignProposalReviewRequestSchema,
  DesignProposalSchema,
} from '@/lib/agent-os/design-lab/types';

describe('DesignProposalReviewRequestSchema', () => {
  it('accepts yes without notes', () => {
    const parsed = DesignProposalReviewRequestSchema.safeParse({
      dayBucket: '2026-06-08',
      decision: 'yes',
    });

    expect(parsed.success).toBe(true);
  });

  it('requires notes for yes-with-notes', () => {
    const parsed = DesignProposalReviewRequestSchema.safeParse({
      dayBucket: '2026-06-08',
      decision: 'yes-with-notes',
    });

    expect(parsed.success).toBe(false);
  });

  it('requires notes for no', () => {
    const parsed = DesignProposalReviewRequestSchema.safeParse({
      dayBucket: '2026-06-08',
      decision: 'no',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts no with rejection direction notes', () => {
    const parsed = DesignProposalReviewRequestSchema.safeParse({
      dayBucket: '2026-06-08',
      decision: 'no',
      notes: 'Avoid gradient hero treatments.',
    });

    expect(parsed.success).toBe(true);
  });
});

describe('DesignProposalSchema', () => {
  const legacy = {
    id: 'legacy',
    surfaceId: 'home',
    surfaceName: 'Home',
    proposalText: 'Legacy proposal',
    assetRefs: [],
    scoring: null,
    linearIssueId: 'JOV-1',
    linearIssueUrl: null,
    status: 'pending',
    createdAt: '2026-06-08T12:00:00.000Z',
    reviewedAt: null,
    reviewer: null,
    reviewNotes: null,
  };

  it('normalizes legacy pending surface records to proposed', () => {
    const parsed = DesignProposalSchema.parse(legacy);
    expect(parsed.status).toBe('proposed');
    expect(parsed.kind).toBe('surface');
    expect(parsed.designGap).toBeNull();
  });

  it('requires a design-gap record for section-gap proposals', () => {
    expect(
      DesignProposalSchema.safeParse({ ...legacy, kind: 'section-gap' }).success
    ).toBe(false);
  });

  it('rejects implemented status without registry evidence', () => {
    expect(
      DesignProposalSchema.safeParse({ ...legacy, status: 'implemented' })
        .success
    ).toBe(false);
  });
});

describe('DesignGapRecordSchema', () => {
  it('consumes the canonical marketing design-gap catalog shape', () => {
    const parsed = DesignGapRecordSchema.parse(PROPOSED_SECTIONS[0]);
    expect(parsed.reviewId).toBe('PROPOSED-SECTION-0001');
    expect(parsed.proposedName).toBeTruthy();
    expect(parsed.wireframes.desktop.placeholderContent).toBe('grayscale-only');
    expect(parsed.registryTask?.trigger).toBe('after-approved');
  });
});
