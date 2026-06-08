import { describe, expect, it } from 'vitest';
import { DesignProposalReviewRequestSchema } from '@/lib/agent-os/design-lab/types';

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
