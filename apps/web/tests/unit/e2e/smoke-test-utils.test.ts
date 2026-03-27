import { describe, expect, it } from 'vitest';
import {
  filterCriticalErrors,
  isExpectedError,
  isExpectedWarning,
} from '@/tests/e2e/utils/smoke-test-utils';

describe('smoke-test-utils', () => {
  describe('isExpectedError', () => {
    it('treats Clerk dev-key errors as expected noise', () => {
      expect(
        isExpectedError(
          'Clerk: Clerk has been loaded with development keys. Development instances have strict usage limits.'
        )
      ).toBe(true);

      expect(
        isExpectedError(
          'Clerk: The request to /v1/client/handshake failed because the dev browser is missing.'
        )
      ).toBe(true);
    });

    it('does not swallow generic publishable-key, cross-origin, or CORS failures', () => {
      expect(
        isExpectedError(
          'Publishable key is missing from the application bootstrap payload.'
        )
      ).toBe(false);

      expect(
        isExpectedError(
          'Cross-origin request blocked while loading https://example.com/script.js'
        )
      ).toBe(false);

      expect(
        isExpectedError(
          'Blocked by CORS policy: No Access-Control-Allow-Origin header is present.'
        )
      ).toBe(false);
    });
  });

  describe('isExpectedWarning', () => {
    it('treats known Clerk local-dev warnings as expected', () => {
      expect(
        isExpectedWarning(
          'Clerk: Clerk has been loaded with development keys. Development instances have strict usage limits.'
        )
      ).toBe(true);

      expect(
        isExpectedWarning(
          "The resource https://distinct-giraffe-5.clerk.accounts.dev/npm/@clerk/ui@1/dist/ui.browser.js was preloaded using link preload but not used within a few seconds from the window's load event."
        )
      ).toBe(true);

      expect(
        isExpectedWarning(
          'Warning: Invalid hook call. Hooks can only be called inside of the body of a function component.'
        )
      ).toBe(true);

      expect(
        isExpectedWarning(
          'React Hook "useQuery" cannot be called conditionally.'
        )
      ).toBe(true);

      expect(
        isExpectedWarning('useContext is unavailable in this test renderer.')
      ).toBe(true);
    });

    it('keeps generic publishable-key and cross-origin warnings visible', () => {
      expect(
        isExpectedWarning(
          'Publishable key is missing from the application bootstrap payload.'
        )
      ).toBe(false);

      expect(
        isExpectedWarning(
          'A cross-origin script attempted to access a restricted frame.'
        )
      ).toBe(false);
    });
  });

  describe('filterCriticalErrors', () => {
    it('removes only the expected Clerk noise', () => {
      expect(
        filterCriticalErrors([
          'Clerk: Clerk has been loaded with development keys.',
          'Blocked by CORS policy: No Access-Control-Allow-Origin header is present.',
        ])
      ).toEqual([
        'Blocked by CORS policy: No Access-Control-Allow-Origin header is present.',
      ]);
    });
  });
});
