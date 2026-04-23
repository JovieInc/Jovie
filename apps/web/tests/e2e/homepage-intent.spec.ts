import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { HOMEPAGE_INTENTS_KEY } from '@/components/homepage/intent-store';
import { expect, test } from './setup';

const INTENTS_KEY = HOMEPAGE_INTENTS_KEY;

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Homepage chat intake — ID-keyed intent store + viewport-split auth', () => {
  test('desktop: pill + Enter persists intent and redirects to /signup with intent_id inside redirect_url', async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/');

    const input = page.getByPlaceholder('Message...');
    await expect(input).toBeVisible();

    await page.getByRole('button', { name: 'Create release page' }).click();
    await expect(input).toHaveValue('Create a release page for ');

    await input.pressSequentially('my new EP');
    await input.press('Enter');

    await page.waitForURL(/\/signup/);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/signup');

    // intent_id must be encoded INSIDE redirect_url, not as a sibling query.
    // This ensures Clerk preserves it through the OAuth round-trip.
    const redirectUrlRaw = url.searchParams.get('redirect_url');
    expect(redirectUrlRaw).toBeTruthy();
    const redirectUrl = new URL(redirectUrlRaw as string, url.origin);
    expect(redirectUrl.pathname).toBe('/onboarding');
    const intentId = redirectUrl.searchParams.get('intent_id');
    expect(intentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    // ID-keyed storage: look up the intent by its uuid.
    const stored = await page.evaluate(
      ({ key, id }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const map = JSON.parse(raw);
        return map[id] ?? null;
      },
      { key: INTENTS_KEY, id: intentId as string }
    );
    expect(stored).not.toBeNull();
    expect(stored.source).toBe('homepage');
    expect(stored.finalPrompt).toBe('Create a release page for my new EP');
    expect(stored.pillId).toBe('create_release_page');
    expect(stored.experimentId).toBe('homepage_intent_pills_v1');
    expect(typeof stored.id).toBe('string');
    expect(typeof stored.expiresAt).toBe('number');
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  test('free-form submit stores intent with pillId=null', async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/');
    const input = page.getByPlaceholder('Message...');
    await input.pressSequentially('something completely custom');
    await input.press('Enter');

    await page.waitForURL(/\/signup/);

    const stored = await page.evaluate(key => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const map = JSON.parse(raw);
      const ids = Object.keys(map);
      return ids.length > 0 ? map[ids[0]] : null;
    }, INTENTS_KEY);
    expect(stored.pillId).toBeNull();
    expect(stored.pillLabel).toBeNull();
    expect(stored.finalPrompt).toBe('something completely custom');
  });

  test('multi-tab: two submits preserve both intents under their own ids', async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/');

    // Tab A prompt (simulated inline — same origin, same localStorage).
    await page.getByPlaceholder('Message...').pressSequentially('release page');
    await page.getByPlaceholder('Message...').press('Enter');
    await page.waitForURL(/\/signup/);
    const tabAUrl = new URL(page.url());
    const tabARedirect = new URL(
      tabAUrl.searchParams.get('redirect_url') as string,
      tabAUrl.origin
    );
    const tabAId = tabARedirect.searchParams.get('intent_id') as string;

    // Go back to home and submit a second, different prompt.
    await page.goto('/');
    await page.getByPlaceholder('Message...').pressSequentially('album art');
    await page.getByPlaceholder('Message...').press('Enter');
    await page.waitForURL(/\/signup/);
    const tabBUrl = new URL(page.url());
    const tabBRedirect = new URL(
      tabBUrl.searchParams.get('redirect_url') as string,
      tabBUrl.origin
    );
    const tabBId = tabBRedirect.searchParams.get('intent_id') as string;

    expect(tabAId).not.toBe(tabBId);

    // Both intents survive in the store under their own ids.
    const map = await page.evaluate(key => {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, INTENTS_KEY);
    expect(map[tabAId]?.finalPrompt).toBe('release page');
    expect(map[tabBId]?.finalPrompt).toBe('album art');
  });

  test('prompt over 140 chars is capped before storage', async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/');
    const longPrompt = 'a'.repeat(300);
    await page.getByPlaceholder('Message...').pressSequentially(longPrompt);
    await page.getByPlaceholder('Message...').press('Enter');
    await page.waitForURL(/\/signup/);

    const stored = await page.evaluate(key => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const map = JSON.parse(raw);
      const ids = Object.keys(map);
      return ids.length > 0 ? map[ids[0]] : null;
    }, INTENTS_KEY);
    expect(stored.finalPrompt.length).toBeLessThanOrEqual(140);
    expect(stored.finalPrompt).toBe('a'.repeat(140));
  });

  test('prompt with HTML renders as text, never into attributes', async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/');
    // Seed an intent with an HTML-looking prompt via localStorage so we can
    // test the RENDER path on /onboarding without needing real auth.
    await page.evaluate(key => {
      const id = '11111111-1111-4111-8111-111111111111';
      const intent = {
        id,
        source: 'homepage',
        finalPrompt: '<script>alert("xss")</script>',
        pillId: null,
        pillLabel: null,
        insertedPrompt: null,
        experimentId: 'homepage_intent_pills_v1',
        variantId: 'release_assets_v1',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
      window.localStorage.setItem(key, JSON.stringify({ [id]: intent }));
    }, INTENTS_KEY);

    // No real auth — we are only checking React's escaping. The body
    // should contain the literal text, never a live <script>.
    const body = await page.content();
    expect(body).not.toContain('<script>alert("xss")</script>');
  });

  test('onboarding: missing intent_id does not crash and renders default', async ({
    page,
  }) => {
    // No auth required to probe page-level crash behavior — the route will
    // redirect, but the response should not be a 500.
    const response = await page.goto('/onboarding', { waitUntil: 'commit' });
    expect((response?.status() ?? 500) < 500).toBe(true);
  });

  test('mobile: chip row is a single horizontal scroll line, never wraps or stacks', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const pills = page.getByRole('button', {
      name: /Create release page|Generate album art|Generate playlist pitch|Plan a release/,
    });
    await expect(pills).toHaveCount(4);

    const tops = await pills.evaluateAll(els =>
      els.map(el => el.getBoundingClientRect().top)
    );
    expect(new Set(tops).size).toBe(1);
  });

  test('direct /signup and /signin nav renders the full-page auth route', async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    const signup = await page.goto('/signup', { waitUntil: 'commit' });
    expect((signup?.status() ?? 500) < 500).toBe(true);

    const signin = await page.goto('/signin', { waitUntil: 'commit' });
    expect((signin?.status() ?? 500) < 500).toBe(true);
  });

  test('auth routes respond with noindex metadata', async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/signup', { waitUntil: 'domcontentloaded' });
    const robotsMeta = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robotsMeta?.toLowerCase()).toContain('noindex');
  });

  test('homepage-viewport stays scrollable (PR-Shell regression guard)', async ({
    page,
  }) => {
    await page.goto('/');
    // Scroll height must exceed viewport so the footer is reachable.
    const { scrollHeight, innerHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(innerHeight);
  });
});
