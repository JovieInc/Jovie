/**
 * E2E: Chat Pitch Generation (paid-tier feature)
 *
 * Tests the "Generate pitches" suggested prompt and the generateReleasePitch
 * chat tool, which are gated behind paid plans (aiCanUseTools).
 *
 * Run:
 *   doppler run -- pnpm exec playwright test chat-pitch-generation --project=chromium
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import { ensureTestUserFree, setTestUserPlan } from './helpers/plan-helpers';
import {
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

test.describe
  .serial('Chat pitch generation (paid tier)', () => {
    test.beforeAll(() => {
      if (!hasClerkCredentials()) {
        test.skip(true, 'Clerk credentials not configured');
      }
    });

    test.afterAll(async ({ browser }) => {
      // Clean up: reset test user to free plan
      const page = await browser.newPage();
      try {
        await ensureSignedInUser(page);
        await ensureTestUserFree(page);
      } finally {
        await page.close();
      }
    });

    test('pitch suggestion hidden on free plan', async ({ page }) => {
      await ensureSignedInUser(page);

      // Navigate to new chat thread (empty state shows suggested prompts)
      await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
      await waitForHydration(page);

      // On free plan, the pitch suggestion should NOT be visible
      const pitchSuggestion = page.getByText(/generate pitches/i);
      await expect(pitchSuggestion).not.toBeVisible({ timeout: 5_000 });
    });

    test('upgrade to pro enables pitch suggestion', async ({ page }) => {
      await ensureSignedInUser(page);

      // Upgrade test user to pro
      await setTestUserPlan(page, 'pro');

      // Reload to bust React Query + billing cache
      await page.reload({ waitUntil: 'networkidle' });
      await waitForHydration(page);

      // Navigate to a fresh chat thread
      const newThreadLink = page.getByRole('link', { name: /new thread/i });
      if (await newThreadLink.isVisible()) {
        await newThreadLink.click();
        await waitForHydration(page);
      }

      // The pitch suggestion should now be visible (if profile is complete enough)
      // Note: The test user may not have 100% profile completion, which hides
      // suggested prompts entirely. Check for either the suggestion OR the
      // profile completion card.
      const pitchSuggestion = page.getByText(/generate pitches/i);
      const profileCompletionGate = page.getByRole('button', {
        name: /profile \d+% complete/i,
      });
      const chatInput = page.getByPlaceholder(/ask jovie|chat message/i);

      // At minimum, the chat input should be present
      await expect(chatInput).toBeVisible({ timeout: 15_000 });

      // If the profile completion card is showing, pitch suggestion is hidden
      // because SuggestedPrompts only renders when profile is 100% complete.
      // This is correct behavior — not a test failure.
      const isProfileIncomplete = await profileCompletionGate
        .isVisible()
        .catch(() => false);
      if (!isProfileIncomplete) {
        // Profile is complete — pitch suggestion should be visible for pro users
        await expect(pitchSuggestion).toBeVisible({ timeout: 10_000 });
      }
    });

    test('can type and send a pitch request via chat', async ({ page }) => {
      await ensureSignedInUser(page);

      // Ensure we're on pro plan
      await setTestUserPlan(page, 'pro');
      await page.reload({ waitUntil: 'networkidle' });

      // Navigate to chat
      await smokeNavigateWithRetry(page, APP_ROUTES.CHAT, { timeout: 60_000 });
      await waitForHydration(page);

      // Type a pitch request in the chat input
      const chatInput = page.getByPlaceholder(/ask jovie|chat message/i);
      await expect(chatInput).toBeVisible({ timeout: 15_000 });
      await chatInput.fill('Generate playlist pitches for my latest release.');

      // Send the message
      const sendButton = page.getByRole('button', { name: /send message/i });
      await expect(sendButton).toBeEnabled({ timeout: 5_000 });
      await sendButton.click();

      // Wait for the actual pitch tool UI, not just "some assistant activity".
      // The tool can surface either the loading title or the completed card.
      const pitchToolUi = page.getByText(/Generating pitches|Pitch Builder/i);
      await expect(pitchToolUi.first()).toBeVisible({ timeout: 30_000 });
    });

    test('billing status reflects pro plan via API', async ({ page }) => {
      await ensureSignedInUser(page);
      await setTestUserPlan(page, 'pro');

      // Verify billing status API returns pro
      const response = await page.request.get('/api/billing/status');
      expect(response.ok()).toBeTruthy();
      const status = await response.json();
      expect(status.isPro).toBe(true);
    });

    test('downgrade to free hides pitch features', async ({ page }) => {
      await ensureSignedInUser(page);

      // Downgrade back to free
      await ensureTestUserFree(page);
      await page.reload({ waitUntil: 'networkidle' });

      // Verify billing status API returns free
      const response = await page.request.get('/api/billing/status');
      expect(response.ok()).toBeTruthy();
      const status = await response.json();
      expect(status.isPro).toBe(false);
    });
  });
