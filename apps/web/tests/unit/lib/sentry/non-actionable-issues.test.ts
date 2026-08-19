import { describe, expect, it } from 'vitest';

import {
  isTransientInfraHttpIssue,
  isTransientInfraHttpTransaction,
  isUpstashQuotaNoise,
  isUpstashQuotaSentryEvent,
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

  describe('isUpstashQuotaNoise', () => {
    it('matches the opaque JSON bag Sentry titled as JOV-5221', () => {
      expect(
        isUpstashQuotaNoise('Error: {"error":{"name":"UpstashError"}}')
      ).toBe(true);
    });

    it('matches the production quota command text', () => {
      expect(
        isUpstashQuotaNoise(
          'UpstashError: Command failed: ERR max requests limit exceeded. Limit: 500000'
        )
      ).toBe(true);
    });

    it('does not match unrelated application errors', () => {
      expect(isUpstashQuotaNoise('TypeError: res.map is not a function')).toBe(
        false
      );
    });
  });

  describe('isUpstashQuotaSentryEvent', () => {
    it('drops events whose exception value is the JSON bag', () => {
      expect(
        isUpstashQuotaSentryEvent({
          exception: {
            values: [{ value: '{"error":{"name":"UpstashError"}}' }],
          },
        })
      ).toBe(true);
    });

    it('keeps unrelated exceptions', () => {
      expect(
        isUpstashQuotaSentryEvent({
          exception: { values: [{ value: 'Unauthorized' }] },
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
