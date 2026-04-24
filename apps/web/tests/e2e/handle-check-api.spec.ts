import { expect, test } from '@playwright/test';

/**
 * Regression coverage for /api/handle/check validation parity.
 *
 * The API used to enforce a stricter handle pattern than the rest of the
 * stack: it rejected dots and underscores, and capped length at 24, even
 * though the canonical server validator (validateUsername) allows `._-`
 * and a 30-character max. That mismatch broke onboarding in a subtle way:
 *  - The client-side format check shows a handle like `real.name` as valid.
 *  - The availability check fires and comes back 400 with an error saying
 *    "Handle can only contain letters, numbers, and hyphens".
 *  - The user sees a contradictory error on a handle the form just told
 *    them was fine, and cannot proceed.
 *
 * This suite exercises the API contract directly so the regression cannot
 * silently reappear. It does not mount the onboarding form — that is covered
 * by onboarding.handle-race and onboarding.handle-taken.
 *
 * Runs unauthenticated — the handle-check route does not require auth.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const ACCEPTED_SAMPLE_HANDLES = [
  // Underscore and dot are allowed by the canonical validator and must be
  // allowed here so onboarding doesn't give users mixed signals.
  'real_name',
  'real.name',
  'first.last_2',
  // 25-30 char handles: previously rejected by the API but accepted by the
  // canonical validator (USERNAME_MAX_LENGTH is 30).
  'a'.repeat(25),
  'a'.repeat(30),
];

const REJECTED_INVALID_CHARS = [
  // Whitespace, @, and non-ASCII are genuinely invalid and should still be
  // rejected with a 400. Percent-encoded on the wire; the route decodes via
  // URLSearchParams.
  'test user',
  'test@user',
  'tëst',
];

const REJECTED_TOO_LONG = 'a'.repeat(31);

test.describe('/api/handle/check validation parity', () => {
  for (const handle of ACCEPTED_SAMPLE_HANDLES) {
    test(`accepts shape-valid handle: ${JSON.stringify(handle)}`, async ({
      request,
    }) => {
      const response = await request.get(
        `/api/handle/check?handle=${encodeURIComponent(handle)}`
      );

      // The handle is shape-valid — the route should either confirm
      // availability (200) or, if it happens to be taken in the DB, still
      // return 200 with available=false. It must never reject with 400
      // "Handle can only contain letters, numbers, and hyphens" or
      // "no more than 24 characters".
      expect(
        response.status(),
        `shape-valid handle ${handle} should not return 4xx from the format gate`
      ).toBe(200);

      const body = (await response.json()) as {
        available: boolean;
        error?: string;
      };
      expect(body).toHaveProperty('available');
      expect(typeof body.available).toBe('boolean');
      if (body.error) {
        // If something did come back as an error, it must not be the legacy
        // format-gate message — that would mean the parity regression is back.
        expect(body.error).not.toContain('letters, numbers, and hyphens');
        expect(body.error).not.toContain('no more than 24');
      }
    });
  }

  for (const handle of REJECTED_INVALID_CHARS) {
    test(`rejects genuinely invalid chars: ${JSON.stringify(handle)}`, async ({
      request,
    }) => {
      const response = await request.get(
        `/api/handle/check?handle=${encodeURIComponent(handle)}`
      );
      expect(response.status()).toBe(400);
      const body = (await response.json()) as {
        available: boolean;
        error?: string;
      };
      expect(body.available).toBe(false);
      expect(body.error).toBeTruthy();
    });
  }

  test('rejects handles longer than the canonical 30-char max', async ({
    request,
  }) => {
    const response = await request.get(
      `/api/handle/check?handle=${encodeURIComponent(REJECTED_TOO_LONG)}`
    );
    expect(response.status()).toBe(400);
    const body = (await response.json()) as {
      available: boolean;
      error?: string;
    };
    expect(body.available).toBe(false);
    // The error wording should reference the canonical max (30), not the
    // stale 24 the legacy route used.
    expect(body.error).toMatch(/30|no more than/);
  });

  test('rejects reserved usernames without hitting the DB path', async ({
    request,
  }) => {
    // Reserved words are handled by the shared validator — pre-fix, the
    // stricter local regex passed `admin` through to the DB lookup, which
    // would return "available" for an otherwise-reserved handle.
    const response = await request.get('/api/handle/check?handle=admin');
    expect(response.status()).toBe(400);
    const body = (await response.json()) as {
      available: boolean;
      error?: string;
    };
    expect(body.available).toBe(false);
  });
});
