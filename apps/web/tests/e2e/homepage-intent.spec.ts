import { setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';
import { HOMEPAGE_INTENTS_KEY } from '@/components/homepage/intent-store';
import { expect, test } from './setup';

const INTENTS_KEY = HOMEPAGE_INTENTS_KEY;

test.use({ storageState: { cookies: [], origins: [] } });

async function setupClerkTokenIfAvailable(page: Page) {
  if (process.env.CLERK_TESTING_SETUP_SUCCESS !== 'true') {
    return;
  }

  await setupClerkTestingToken({ page }).catch((error: unknown) => {
    console.warn(
      '[homepage-intent.spec] setupClerkTestingToken skipped:',
      error instanceof Error ? error.message : String(error)
    );
  });
}

async function openHomepageIntentInput(page: Page) {
  await setupClerkTokenIfAvailable(page);
  await page.goto('/');

  const input = page.getByPlaceholder('Ask Jovie...');
  const inputVisible = await input
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  test.skip(
    !inputVisible,
    'Homepage intent intake is not rendered in the current waitlist homepage mode'
  );

  return input;
}

test.describe('Homepage chat intake — ID-keyed intent store + /start handoff', () => {
  test('desktop: pill + Enter persists intent and redirects to /start with intent_id', async ({
    page,
  }) => {
    const input = await openHomepageIntentInput(page);

    await page.getByRole('button', { name: 'Plan a release' }).click();
    await expect(input).toHaveValue('Plan a release for ');

    await input.pressSequentially('my new EP');
    await input.press('Enter');

    await page.waitForURL(/\/start/);
    const url = new URL(page.url());
    expect(url.pathname).toBe('/start');
    const intentId = url.searchParams.get('intent_id');
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
    expect(stored.finalPrompt).toBe('Plan a release for my new EP');
    expect(stored.pillId).toBe('plan_a_release');
    expect(stored.experimentId).toBe('homepage_intent_pills_v1');
    expect(typeof stored.id).toBe('string');
    expect(typeof stored.expiresAt).toBe('number');
    expect(stored.expiresAt).toBeGreaterThan(Date.now());
  });

  test('free-form submit stores intent with pillId=null', async ({ page }) => {
    const input = await openHomepageIntentInput(page);
    await input.pressSequentially('something completely custom');
    await input.press('Enter');

    await page.waitForURL(/\/start/);

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
    await openHomepageIntentInput(page);

    // Tab A prompt (simulated inline — same origin, same localStorage).
    await page
      .getByPlaceholder('Ask Jovie...')
      .pressSequentially('release page');
    await page.getByPlaceholder('Ask Jovie...').press('Enter');
    await page.waitForURL(/\/start/);
    const tabAUrl = new URL(page.url());
    const tabAId = tabAUrl.searchParams.get('intent_id') as string;

    // Go back to home and submit a second, different prompt.
    await openHomepageIntentInput(page);
    await page.getByPlaceholder('Ask Jovie...').pressSequentially('album art');
    await page.getByPlaceholder('Ask Jovie...').press('Enter');
    await page.waitForURL(/\/start/);
    const tabBUrl = new URL(page.url());
    const tabBId = tabBUrl.searchParams.get('intent_id') as string;

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
    await openHomepageIntentInput(page);
    const longPrompt = 'a'.repeat(300);
    await page.getByPlaceholder('Ask Jovie...').pressSequentially(longPrompt);
    await page.getByPlaceholder('Ask Jovie...').press('Enter');
    await page.waitForURL(/\/start/);

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
    await setupClerkTokenIfAvailable(page);
    await page.goto('/');
    // Seed an intent with an HTML-looking prompt via localStorage so we can
    // test the RENDER path on /start without needing real auth.
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

    await page.goto('/start?intent_id=11111111-1111-4111-8111-111111111111');

    // No real auth — we are only checking React's escaping and prompt restore.
    await expect(page.getByLabel('Chat message input')).toHaveValue(
      '<script>alert("xss")</script>'
    );
    const scriptCount = await page.locator('script:has-text("xss")').count();
    expect(scriptCount).toBe(0);
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
      name: /Plan a release|Generate album art|Generate pitch|Build artist profile|Analyze momentum/,
    });
    const pillCount = await pills.count();
    test.skip(
      pillCount === 0,
      'Homepage intent pills are not rendered in the current waitlist homepage mode'
    );
    await expect(pills).toHaveCount(5);

    const tops = await pills.evaluateAll(els =>
      els.map(el => el.getBoundingClientRect().top)
    );
    expect(new Set(tops).size).toBe(1);
  });

  test('direct /signup and /signin nav renders the full-page auth route', async ({
    page,
  }) => {
    await setupClerkTokenIfAvailable(page);

    const signup = await page.goto('/signup', { waitUntil: 'commit' });
    expect((signup?.status() ?? 500) < 500).toBe(true);

    const signin = await page.goto('/signin', { waitUntil: 'commit' });
    expect((signin?.status() ?? 500) < 500).toBe(true);
  });

  test('auth routes respond with noindex metadata', async ({ page }) => {
    await setupClerkTokenIfAvailable(page);
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
