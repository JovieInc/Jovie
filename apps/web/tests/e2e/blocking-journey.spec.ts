import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  fillControlledInputUntilEnabled,
  prepareBetterAuthEmailOtp,
} from '../helpers/auth';
import { subscribeAsFan } from './helpers/fan-subscribe-flow';
import { installPublicRouteMocks } from './utils/public-surface-helpers';
import { installRuntimeAutomationBypass } from './utils/runtime-automation-bypass';

// Release only this test's artist identity so independent repeat runs can
// exercise a fresh signup. All rows live in the explicitly isolated database.
test.afterEach(async ({}, info) => {
  const email = info.annotations.find(
    a => a.type === 'fixture-email'
  )?.description;
  if (!email || !process.env.DATABASE_URL) return;
  const sql = neon(process.env.DATABASE_URL);
  await sql`
    UPDATE creator_profiles SET spotify_id = NULL, spotify_url = NULL
    WHERE user_id IN (SELECT id FROM users WHERE email = ${email})
  `;
});

// Real signup, onboarding, and writes. Only telemetry and the final Stripe
// boundary are mocked; music enrichment continues through the existing provider.
test('signup -> onboarding -> profile/link -> smart link -> public profile -> checkout', async ({
  page,
}) => {
  const databaseUrl = process.env.DATABASE_URL;
  expect(databaseUrl, 'An isolated journey database is required').toBeTruthy();
  expect(new URL(databaseUrl!).pathname).toMatch(/^\/jovie_gp_blocking_/);
  const sql = neon(databaseUrl!);
  const handle = `gp-${randomUUID().slice(0, 8)}`;
  const email = `${handle}+e2e@test.jovie.com`;
  test.info().annotations.push({ type: 'fixture-email', description: email });
  test.info().annotations.push({
    type: 'database',
    description: 'isolated golden-path database',
  });
  await installPublicRouteMocks(page);
  await page.addInitScript(installRuntimeAutomationBypass);
  await page.route('**/api/chat', route =>
    route.continue({
      headers: { ...route.request().headers(), 'x-jovie-e2e-llm-failure': '1' },
    })
  );

  await test.step('sign up with a fresh Better Auth identity', async () => {
    const auth = await prepareBetterAuthEmailOtp(page, {
      email,
      entryPath: '/signup',
      // Cold dev-server compile + hydration is not a product regression.
      timeout: 120_000,
      beforeResponseFulfill: async userId => {
        const users = await sql`
          UPDATE users SET user_status = 'waitlist_approved'
          WHERE better_auth_user_id = ${userId} RETURNING id
        `;
        expect(users).toHaveLength(1);
      },
    });
    try {
      await auth.submit();
    } finally {
      await auth.dispose();
    }
    await expect(page).toHaveURL(/\/start(?:\?|$)/);
  });

  await test.step('complete onboarding through the product controls', async () => {
    const input = page.locator('[aria-label="Chat message input" i]');
    const send = page.getByRole('button', { name: 'Send message' });
    const sendTurn = async (text: string) => {
      await fillControlledInputUntilEnabled(input, send, text, 90_000);
      const [response] = await Promise.all([
        page.waitForResponse(
          r =>
            r.request().method() === 'POST' &&
            new URL(r.url()).pathname === '/api/chat'
        ),
        send.click(),
      ]);
      expect(response.status()).toBe(200);
      await expect(input).toBeEditable({ timeout: 60_000 });
      return response;
    };
    // The deterministic onboarding engine names the stage it answered with in
    // x-onboarding-fallback; asserting it separates "injection is off" from
    // "the card never rendered".
    const artistTurn = await sendTurn(
      'https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN'
    );
    expect(artistTurn.headers()['x-onboarding-fallback']).toMatch(
      /^confirm_artist:/
    );
    const handleTurn = await sendTurn('Set my profile handle');
    expect(handleTurn.headers()['x-onboarding-fallback']).toMatch(/^handle:/);
    const card = page.getByTestId('onboarding-handle-check');
    await expect(card).toBeVisible();
    await card.getByLabel('Edit Proposed Handle').fill(handle);
    await expect(card.getByText('is available')).toBeVisible();
    await card.getByTestId('onboarding-confirm-handle').click();
    await expect(page.getByTestId('onboarding-social-link')).toBeVisible();
    await sendTurn('About 500 monthly listeners right now');
    await expect
      .poll(async () => {
        const [profile] = await sql`
        SELECT cp.is_public, cp.is_claimed, cp.onboarding_completed_at
        FROM creator_profiles cp JOIN users u ON u.id = cp.user_id
        WHERE u.email = ${email} AND cp.username_normalized = ${handle}
      `;
        return profile ?? null;
      })
      .toMatchObject({
        is_public: true,
        is_claimed: true,
        onboarding_completed_at: expect.anything(),
      });
    await page.goto(APP_ROUTES.CHAT);
    await expect(page).toHaveURL(/\/app\/chat/);
  });

  await test.step('edit the profile and persist a social link', async () => {
    await page.goto(APP_ROUTES.SETTINGS_PROFILE);
    const name = page.getByRole('textbox', {
      name: 'Display name',
      exact: true,
    });
    await name.fill('Golden Path Artist');
    await name.blur();
    await expect
      .poll(async () => {
        const [row] =
          await sql`SELECT display_name FROM creator_profiles WHERE username_normalized = ${handle}`;
        return row?.display_name;
      })
      .toBe('Golden Path Artist');
    await page.goto(`${APP_ROUTES.CHAT_PROFILE_PANEL}&tab=social`);
    const drawer = page.getByTestId('profile-contact-sidebar');
    await expect(drawer).toBeVisible();
    await drawer
      .getByRole('button', { name: 'Add Social link', exact: true })
      .click();
    const link = drawer.getByRole('textbox', { name: 'Add Link', exact: true });
    await link.fill('https://www.instagram.com/jovie_journey');
    await link.press('Enter');
    await expect
      .poll(async () => {
        const rows = await sql`
        SELECT sl.url FROM social_links sl JOIN creator_profiles cp ON cp.id = sl.creator_profile_id
        WHERE cp.username_normalized = ${handle} AND sl.url LIKE '%jovie_journey%'
      `;
        return rows.length;
      })
      .toBe(1);
    await page.reload();
    await expect(page.getByTestId('profile-contact-sidebar')).toContainText(
      'Golden Path Artist'
    );
  });

  const releaseTitle = 'Golden Path Single';
  const releasePath = `/${handle}/golden-path-single`;
  await test.step('create a release and its smart link through the library', async () => {
    await page.goto(APP_ROUTES.RELEASES);
    await page.getByRole('button', { name: 'Create a new release' }).click();
    await page.getByRole('menuitem', { name: 'Add manually' }).click();
    const drawer = page.getByTestId('add-release-sidebar');
    const createRelease = drawer.getByRole('button', {
      name: 'Create Release',
      exact: true,
    });
    // The drawer is a lazy chunk: a fill that lands before React attaches its
    // handlers changes only the DOM and is reverted on the next render. The
    // button is enabled only once the title reached React state, so retry the
    // fill until that is observable.
    try {
    await expect(async () => {
      await drawer.getByLabel('Title', { exact: true }).fill(releaseTitle);
      await expect(createRelease).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    } catch (e) {
      const info = await page.evaluate(() => ({
        url: location.href,
        drawers: document.querySelectorAll('[data-testid="add-release-sidebar"]').length,
        inputs: [...document.querySelectorAll('#release-title')].map(i => ({ v: (i as HTMLInputElement).value, ro: (i as HTMLInputElement).readOnly, dis: (i as HTMLInputElement).disabled, keys: Object.keys(i).filter(k => k.startsWith('__react')) })),
        html: document.querySelector('[data-testid="add-release-sidebar"]')?.outerHTML.slice(0, 2500),
      }));
      console.log('DIAG', JSON.stringify(info));
      throw e;
    }
    await drawer
      .getByRole('button', { name: 'Release Date', exact: true })
      .click();
    await drawer.getByRole('button', { name: /today/i }).click();
    await expect(createRelease).toBeEnabled();
    await createRelease.click();
    await expect(page.getByTestId('release-sidebar')).toContainText(
      releaseTitle
    );
    const rows = await sql`
      SELECT dr.slug, dr.source_type FROM discog_releases dr
      JOIN creator_profiles cp ON cp.id = dr.creator_profile_id
      WHERE cp.username_normalized = ${handle} AND dr.title = ${releaseTitle}
    `;
    expect(rows).toEqual([
      { slug: 'golden-path-single', source_type: 'manual' },
    ]);
    const response = await page.goto(releasePath);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: releaseTitle, level: 1 })
    ).toBeVisible();
  });

  await test.step('view the persisted public profile as a signed-out fan', async () => {
    const fan = await page.context().browser()!.newContext();
    try {
      const publicPage = await fan.newPage();
      await installPublicRouteMocks(publicPage);
      const response = await publicPage.goto(
        new URL(`/${handle}`, page.url()).href
      );
      expect(response?.status()).toBe(200);
      await expect(
        publicPage.getByRole('heading', {
          name: 'Golden Path Artist',
          level: 1,
        })
      ).toBeVisible();
      expect(
        (await fan.cookies()).some(c => c.name.includes('session_token'))
      ).toBe(false);
    } finally {
      await fan.close();
    }
  });
  await test.step('a fan subscribes and the artist sees them in the audience', async () => {
    const fanEmail = `fan-${handle}@test.jov.ie`;
    const fan = await page
      .context()
      .browser()!
      .newContext({ baseURL: new URL(page.url()).origin });
    try {
      const fanPage = await fan.newPage();
      await installPublicRouteMocks(fanPage);
      await subscribeAsFan(fanPage, handle, fanEmail);
    } finally {
      await fan.close();
    }
    await expect
      .poll(async () => {
        const rows = await sql`
          SELECT 1 FROM notification_subscriptions ns
          JOIN creator_profiles cp ON cp.id = ns.creator_profile_id
          WHERE cp.username_normalized = ${handle}
            AND ns.channel = 'email' AND lower(ns.email) = ${fanEmail}
            AND ns.confirmed_at IS NOT NULL
        `;
        return rows.length;
      })
      .toBe(1);
    await page.goto(APP_ROUTES.AUDIENCE);
    await expect(page.getByText(fanEmail).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  await test.step('start checkout from the product upgrade screen', async () => {
    const checkoutUrl =
      'https://checkout.stripe.com/c/pay/cs_test_jovie_journey';
    await page.route('**/api/stripe/checkout', async route => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().postDataJSON()).toMatchObject({
        priceId: 'price_jovie_journey_pro',
        humanConfirmed: true,
        source: 'onboarding',
      });
      await route.fulfill({
        json: { url: checkoutUrl, sessionId: 'cs_test_jovie_journey' },
      });
    });
    await page.route(checkoutUrl, route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en"><title>Mock Stripe checkout</title><h1>Stripe test checkout</h1></html>',
      })
    );
    await page.goto(`${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=pro&source=intent`);
    await page
      .getByRole('button', { name: 'Upgrade to Artist Presence', exact: true })
      .click();
    await expect(page).toHaveURL(checkoutUrl);
    await expect(
      page.getByRole('heading', { name: 'Stripe test checkout' })
    ).toBeVisible();
  });
});
