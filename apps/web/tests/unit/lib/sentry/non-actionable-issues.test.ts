import { describe, expect, it } from 'vitest';

import {
  isNonActionableUpstashIssue,
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

  describe('isNonActionableUpstashIssue', () => {
    it('matches the opaque JSON.stringify UpstashError title', () => {
      expect(
        isNonActionableUpstashIssue({
          title: 'Error: {"error":{"name":"UpstashError"}}',
        })
      ).toBe(true);
    });

    it('matches clerkUserId-wrapped opaque UpstashError titles', () => {
      expect(
        isNonActionableUpstashIssue({
          title:
            'Error: {"clerkUserId":"af5b9ee0-ecec-4508-86e0-4f364c2e349d","error":{"name":"UpstashError"}}',
        })
      ).toBe(true);
    });

    it('matches quota-exhausted UpstashError titles', () => {
      expect(
        isNonActionableUpstashIssue({
          title:
            'UpstashError: Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500099',
        })
      ).toBe(true);
    });

    it('does not match unrelated auth failures', () => {
      expect(
        isNonActionableUpstashIssue({
          title:
            'UpstashError: WRONGPASS invalid or missing auth token. See https://docs.upstash.com/redis/troubleshooting/http_unauthorized for details.',
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
