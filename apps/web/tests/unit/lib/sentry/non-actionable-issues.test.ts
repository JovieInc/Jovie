import { describe, expect, it } from 'vitest';

import {
  isTransientInfraHttpIssue,
  isTransientInfraHttpTransaction,
} from '@/lib/sentry/non-actionable-issues';

describe('non-actionable Sentry issues', () => {
  describe('isTransientInfraHttpIssue', () => {
    it('matches Degraded HTTP Operation on POST /pipeline', () => {
      expect(
        isTransientInfraHttpIssue({
          title: 'Degraded HTTP Operation',
          culprit: 'POST /pipeline',
        })
      ).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(
        isTransientInfraHttpIssue({
          title: 'degraded http operation',
          culprit: 'post /pipeline',
        })
      ).toBe(true);
    });

    it('does not match other degraded HTTP culprits', () => {
      expect(
        isTransientInfraHttpIssue({
          title: 'Degraded HTTP Operation',
          culprit: 'GET /api/health',
        })
      ).toBe(false);
    });

    it('does not match unrelated Sentry issues', () => {
      expect(
        isTransientInfraHttpIssue({
          title: 'TypeError: Cannot read properties of undefined',
          culprit: 'POST /pipeline',
        })
      ).toBe(false);
    });
  });

  describe('isTransientInfraHttpTransaction', () => {
    it('matches POST /pipeline', () => {
      expect(isTransientInfraHttpTransaction('POST /pipeline')).toBe(true);
    });

    it('does not match unrelated transactions', () => {
      expect(isTransientInfraHttpTransaction('GET /api/health')).toBe(false);
    });
  });
});
