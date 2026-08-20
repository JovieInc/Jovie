import { describe, expect, it } from 'vitest';

import {
  isNonActionableUpstashErrorBag,
  isNonActionableUpstashErrorBagEvent,
  isNonActionableUpstashIssue,
  isOpaqueUpstashErrorJsonBag,
  isTransientInfraHttpIssue,
  isTransientInfraHttpTransaction,
  isUpstashQuotaNoise,
  isUpstashQuotaSentryEvent,
  UPSTASH_ERROR_JSON_BAG,
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

  describe('isNonActionableUpstashErrorBag', () => {
    it('matches the JOV-5186 Linear/Sentry title', () => {
      expect(
        isNonActionableUpstashErrorBag({
          title: `Error: ${UPSTASH_ERROR_JSON_BAG}`,
        })
      ).toBe(true);
    });

    it('matches the JOV-5209 Linear/Sentry title', () => {
      expect(
        isNonActionableUpstashErrorBag({
          title: `Error: ${UPSTASH_ERROR_JSON_BAG}`,
          culprit: 'captureWarning',
        })
      ).toBe(true);
    });

    it('matches the raw JSON bag as the exception value', () => {
      expect(
        isNonActionableUpstashErrorBag({
          title: UPSTASH_ERROR_JSON_BAG,
        })
      ).toBe(true);
    });

    it('does not match a real Upstash quota exception (JOV-5199)', () => {
      expect(
        isNonActionableUpstashErrorBag({
          title:
            'UpstashError: Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500099',
        })
      ).toBe(false);
    });

    it('does not match the clerkUserId bag owned by JOV-5185', () => {
      expect(
        isNonActionableUpstashErrorBag({
          title:
            'Error: {"clerkUserId":"af5b9ee0-ecec-4508-86e0-4f364c2e349d","error":{"name":"UpstashError"}}',
        })
      ).toBe(false);
    });

    it('matches a prefixed JOV-5228 Sentry title', () => {
      expect(
        isNonActionableUpstashErrorBag({
          title: 'Unhandled error: {"error":{"name":"UpstashError"}}',
        })
      ).toBe(true);
    });
  });

  describe('isNonActionableUpstashErrorBagEvent', () => {
    it('matches an Error whose value is the JSON bag', () => {
      expect(
        isNonActionableUpstashErrorBagEvent({
          exception: {
            values: [{ type: 'Error', value: UPSTASH_ERROR_JSON_BAG }],
          },
        })
      ).toBe(true);
    });

    it('matches a title-only JOV-5229 Linear/Sentry event', () => {
      expect(
        isNonActionableUpstashErrorBagEvent({
          title: `Error: ${UPSTASH_ERROR_JSON_BAG}`,
        })
      ).toBe(true);
    });

    it('does not match a quota-exceeded UpstashError', () => {
      expect(
        isNonActionableUpstashErrorBagEvent({
          exception: {
            values: [
              {
                type: 'UpstashError',
                value:
                  'Command failed: ERR max requests limit exceeded. Limit: 500000',
              },
            ],
          },
        })
      ).toBe(false);
    });

    it('matches a prefixed JSON-bag exception value (JOV-5228)', () => {
      expect(
        isNonActionableUpstashErrorBagEvent({
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Unhandled {"error":{"name":"UpstashError"}}',
              },
            ],
          },
        })
      ).toBe(true);
    });
  });

  describe('isOpaqueUpstashErrorJsonBag', () => {
    it('matches an Error whose message is the JSON bag', () => {
      expect(
        isOpaqueUpstashErrorJsonBag(new Error(UPSTASH_ERROR_JSON_BAG))
      ).toBe(true);
    });

    it('matches a thrown { error: UpstashError } object (JOV-5218)', () => {
      const inner = new Error(
        'Command failed: ERR max requests limit exceeded. Limit: 500000'
      );
      inner.name = 'UpstashError';
      expect(JSON.stringify({ error: inner })).toBe(UPSTASH_ERROR_JSON_BAG);
      expect(isOpaqueUpstashErrorJsonBag({ error: inner })).toBe(true);
    });

    it('matches a Next.js wrapper whose cause is the JSON bag (JOV-5209)', () => {
      const wrapper = new Error(
        'An error occurred in the Server Components render'
      );
      wrapper.cause = { error: { name: 'UpstashError' } };
      expect(isOpaqueUpstashErrorJsonBag(wrapper)).toBe(true);
    });

    it('does not hang on a circular Error.cause chain (JOV-5209)', () => {
      const wrapper = new Error('wrapped');
      wrapper.cause = wrapper;
      expect(isOpaqueUpstashErrorJsonBag(wrapper)).toBe(false);
    });

    it('matches the JOV-5229 Linear title', () => {
      expect(
        isOpaqueUpstashErrorJsonBag(`Error: ${UPSTASH_ERROR_JSON_BAG}`)
      ).toBe(true);
    });

    it('does not match a real quota UpstashError instance', () => {
      const error = new Error(
        'Command failed: ERR max requests limit exceeded. Limit: 500000'
      );
      error.name = 'UpstashError';
      expect(isOpaqueUpstashErrorJsonBag(error)).toBe(false);
    });

    it('does not match a real Upstash quota exception', () => {
      expect(
        isOpaqueUpstashErrorJsonBag(
          'UpstashError: Command failed: ERR max requests limit exceeded. Limit: 500000'
        )
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
