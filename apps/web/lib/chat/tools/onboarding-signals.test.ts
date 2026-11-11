import { describe, expect, it } from 'vitest';
import { PRODUCT_CAPABILITIES } from '@/data/product-truth/registry';
import {
  collapseInterviewSignals,
  interviewSignalSchema,
  VISITOR_AVAILABLE_CAPABILITY_IDS,
  WANT_NOT_AVAILABLE,
} from './onboarding-signals';

const recordedAt = '2026-11-11T00:00:00.000Z';

describe('visitor-available capability ids', () => {
  it('derives from product truth: built, public and usable only', () => {
    expect(VISITOR_AVAILABLE_CAPABILITY_IDS.length).toBeGreaterThan(0);
    for (const id of VISITOR_AVAILABLE_CAPABILITY_IDS) {
      const capability = PRODUCT_CAPABILITIES[id];
      expect(capability.maturity).not.toBe('proposed');
      expect(capability.publication).toBe('public');
      expect(['open', 'enrolled']).toContain(capability.access);
    }
    expect(VISITOR_AVAILABLE_CAPABILITY_IDS).toContain('smart-links');
    // Proposed/internal and unlisted capabilities are not offered to visitors.
    expect(VISITOR_AVAILABLE_CAPABILITY_IDS).not.toContain('fan-subscriptions');
    expect(VISITOR_AVAILABLE_CAPABILITY_IDS).not.toContain('voice');
  });
});

describe('interviewSignalSchema want', () => {
  it('accepts a want alone, matched to an available capability', () => {
    const parsed = interviewSignalSchema.safeParse({
      want: { text: 'One link for my new single', capability: 'smart-links' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a not_available want', () => {
    const parsed = interviewSignalSchema.safeParse({
      want: { text: 'Paid fan memberships', capability: WANT_NOT_AVAILABLE },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects capability ids a visitor cannot get today', () => {
    for (const capability of ['fan-subscriptions', 'made-up-capability']) {
      const parsed = interviewSignalSchema.safeParse({
        want: { text: 'Paid fan memberships', capability },
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('rejects an empty want text and unknown want keys', () => {
    expect(
      interviewSignalSchema.safeParse({
        want: { text: '', capability: WANT_NOT_AVAILABLE },
      }).success
    ).toBe(false);
    expect(
      interviewSignalSchema.safeParse({
        want: { text: 'x', capability: WANT_NOT_AVAILABLE, extra: true },
      }).success
    ).toBe(false);
  });

  it('collapses to the most recent want', () => {
    const collapsed = collapseInterviewSignals([
      {
        want: { text: 'first', capability: WANT_NOT_AVAILABLE },
        recordedAt,
      },
      { releaseStage: 'just_released', recordedAt },
      { want: { text: 'second', capability: 'smart-links' }, recordedAt },
    ]);
    expect(collapsed.want).toEqual({
      text: 'second',
      capability: 'smart-links',
    });
    expect(collapsed.releaseStage).toBe('just_released');
  });
});
