import { neon } from '@neondatabase/serverless';
import type { Page, TestInfo } from '@playwright/test';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { createFreshUser, interceptTrackingCalls } from './helpers/e2e-helpers';
import { expect, test } from './setup';
import { waitForHydration } from './utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
  video: process.env.CI ? 'off' : 'on',
});

type StreamChunk = Record<string, unknown>;

const COMPOSER_TEXTAREA = '[aria-label="Chat Message Input"]';

function uiStreamBody(chunks: readonly StreamChunk[]) {
  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

function textAndToolStream({
  messageId,
  text,
  toolName,
  toolCallId,
  input,
  output,
}: {
  readonly messageId: string;
  readonly text: string;
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
}) {
  return uiStreamBody([
    { type: 'start', messageId },
    { type: 'start-step' },
    { type: 'text-start', id: `${messageId}-text` },
    { type: 'text-delta', id: `${messageId}-text`, delta: text },
    { type: 'text-end', id: `${messageId}-text` },
    {
      type: 'tool-input-available',
      toolName,
      toolCallId,
      input,
    },
    {
      type: 'tool-output-available',
      toolCallId,
      output,
    },
    { type: 'finish-step' },
    { type: 'finish', finishReason: 'stop' },
  ]);
}

async function suppressDevToolbar(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('__dev_toolbar_hidden', '1');
    document.documentElement?.style.setProperty('--dev-toolbar-height', '0px');
    const style = document.createElement('style');
    style.id = 'jovie-e2e-hide-dev-toolbar';
    style.textContent = '[data-testid="dev-toolbar"]{display:none!important}';
    document.head.appendChild(style);
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function mockWaitlistOnboardingChat(page: Page) {
  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON() as {
      readonly mode?: string;
      readonly messages?: unknown[];
    };
    expect(body.mode).toBe('onboarding');
    expect(Array.isArray(body.messages)).toBe(true);

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'set-cookie':
          'jovie_onboarding_session=e2e-waitlist-session; Path=/; HttpOnly; SameSite=Lax',
      },
      body: textAndToolStream({
        messageId: 'assistant-waitlist',
        text: 'qualified enough to know the route. this belongs on the early list while we verify the release setup.',
        toolName: 'proposeNextStep',
        toolCallId: 'tool-next-step',
        input: {},
        output: {
          action: 'propose_next_step',
          decision: {
            kind: 'waitlist',
            rationale: 'e2e_local_seeded_waitlist',
            score: 30,
          },
        },
      }),
    });
  });
}

function requireDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required for local waitlist golden path');
  }
  return dbUrl;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function seedQualifiedWaitlistUser(input: {
  readonly clerkUserId: string;
  readonly email: string;
}) {
  const sql = neon(requireDatabaseUrl());
  const emailNormalized = normalizeEmail(input.email);

  await sql`
    DELETE FROM waitlist_entries
    WHERE email_normalized = ${emailNormalized}
      OR lower(email) = ${emailNormalized}
  `;

  const [entry] = (await sql`
    INSERT INTO waitlist_entries (
      full_name,
      email,
      email_normalized,
      primary_social_url,
      primary_social_platform,
      primary_social_url_normalized,
      spotify_url,
      spotify_url_normalized,
      spotify_artist_name,
      heard_about,
      primary_goal,
      selected_plan,
      status,
      source,
      canonical,
      qualification_inputs,
      qualification_result,
      qualified_at,
      waitlisted_at,
      created_at,
      updated_at
    )
    VALUES (
      'Golden Path Artist',
      ${input.email},
      ${emailNormalized},
      'https://instagram.com/golden_path_artist',
      'instagram',
      'instagram.com/golden_path_artist',
      'https://open.spotify.com/artist/4u',
      'open.spotify.com/artist/4u',
      'Golden Path Artist',
      'local golden path qa',
      'Release setup',
      'pro',
      'waitlisted',
      'onboarding_chat',
      true,
      ${JSON.stringify({ releaseStage: 'pre_announce' })}::jsonb,
      ${JSON.stringify({ decision: 'waitlist', score: 30 })}::jsonb,
      NOW(),
      NOW(),
      NOW(),
      NOW()
    )
    RETURNING id
  `) as Array<{ id: string }>;

  if (!entry?.id) {
    throw new Error('Failed to seed waitlist entry');
  }

  await sql`
    INSERT INTO users (clerk_id, email, name, user_status, waitlist_entry_id, updated_at)
    VALUES (
      ${input.clerkUserId},
      ${input.email},
      'Golden Path Artist',
      'waitlist_pending',
      ${entry.id},
      NOW()
    )
    ON CONFLICT (clerk_id) DO UPDATE SET
      email = ${input.email},
      name = 'Golden Path Artist',
      user_status = 'waitlist_pending',
      waitlist_entry_id = ${entry.id},
      updated_at = NOW()
  `;

  return entry.id;
}

async function readWaitlistState(input: {
  readonly clerkUserId: string;
  readonly entryId: string;
}) {
  const sql = neon(requireDatabaseUrl());
  const [row] = (await sql`
    SELECT
      u.user_status,
      u.waitlist_entry_id::text AS waitlist_entry_id,
      w.status AS waitlist_status,
      w.qualified_at IS NOT NULL AS qualified,
      w.waitlisted_at IS NOT NULL AS waitlisted,
      w.approved_at IS NOT NULL AS approved
    FROM users u
    INNER JOIN waitlist_entries w ON w.id = ${input.entryId}
    WHERE u.clerk_id = ${input.clerkUserId}
    LIMIT 1
  `) as Array<{
    user_status: string;
    waitlist_entry_id: string | null;
    waitlist_status: string;
    qualified: boolean;
    waitlisted: boolean;
    approved: boolean;
  }>;

  if (!row) {
    throw new Error('Missing golden path waitlist state');
  }
  return row;
}

test.describe('local seeded waitlist golden path', () => {
  test('homepage to chat qualification to waitlist approval', async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
      'Local seeded golden path requires E2E_USE_TEST_AUTH_BYPASS=1'
    );
    test.skip(!process.env.DATABASE_URL, 'DATABASE_URL is required');

    test.setTimeout(180_000);
    const seed = `wl-${Date.now().toString(36)}`;

    await suppressDevToolbar(page);
    await interceptTrackingCalls(page);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
    await capture(page, testInfo, 'golden-path-01-homepage');

    const { email, clerkUserId } = await createFreshUser(page, seed);
    await mockWaitlistOnboardingChat(page);

    await page.goto('/start', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await capture(page, testInfo, 'golden-path-02-signed-up-start');
    await page
      .locator(COMPOSER_TEXTAREA)
      .fill('Golden Path Artist has a release in three weeks.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText("You're on the list")).toBeVisible({
      timeout: 30_000,
    });
    await capture(page, testInfo, 'golden-path-03-qualified-waitlisted-chat');

    const entryId = await seedQualifiedWaitlistUser({
      clerkUserId,
      email,
    });
    await expect
      .poll(async () => await readWaitlistState({ clerkUserId, entryId }))
      .toMatchObject({
        user_status: 'waitlist_pending',
        waitlist_entry_id: entryId,
        waitlist_status: 'waitlisted',
        qualified: true,
        waitlisted: true,
      });

    await capture(page, testInfo, 'golden-path-04-waitlist-before-approval');

    const approval = await page.request.post('/api/dev/unwaitlist', {
      timeout: 90_000,
    });
    if (!approval.ok()) {
      throw new Error(
        `Expected dev unwaitlist approval to succeed, got ${approval.status()}: ${await approval.text()}`
      );
    }
    await capture(page, testInfo, 'golden-path-05-waitlist-approved');

    await expect
      .poll(async () => await readWaitlistState({ clerkUserId, entryId }))
      .toMatchObject({
        user_status: 'waitlist_approved',
        waitlist_entry_id: entryId,
        waitlist_status: 'invited',
        approved: true,
      });

    await setTestAuthBypassSession(page, null, clerkUserId);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);
    await expect(page).not.toHaveURL(/\/waitlist(?:\?|$)/);
    await capture(page, testInfo, 'golden-path-06-approved-app-entry');

    const video = page.video();
    if (video) {
      await page.close();
      const videoPath = testInfo.outputPath('golden-path-waitlist-local.webm');
      await video.saveAs(videoPath);
      await testInfo.attach('golden-path-waitlist-local-video', {
        path: videoPath,
        contentType: 'video/webm',
      });
    }
  });
});
