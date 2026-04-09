import { neon } from '@neondatabase/serverless';
import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';
import {
  assertNoCriticalErrors,
  setupPageMonitoring,
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

interface PresenceSeedContext {
  readonly profileId: string;
}

type PresenceProviderId = 'spotify' | 'youtube_music';
type PresenceMatchStatus =
  | 'suggested'
  | 'confirmed'
  | 'auto_confirmed'
  | 'rejected'
  | null;

const databaseUrl = process.env.DATABASE_URL?.trim();
const sql = databaseUrl ? neon(databaseUrl) : null;
const useTestAuthBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

let creatorContext: PresenceSeedContext | null = null;

const PRESENCE_SUITE_EXTERNAL_IDS = [
  'spotify-suggested',
  'youtube-suggested',
  'apple-confirmed',
] as const;

async function resolveCreatorContext(): Promise<PresenceSeedContext> {
  if (!sql) {
    throw new Error('DATABASE_URL is required for presence E2E coverage');
  }
  if (creatorContext) {
    return creatorContext;
  }

  const [row] = await sql<Array<{ profile_id: string }>>`
    select p.id as profile_id
    from creator_profiles p
    where p.username = 'browse-test-user'
    limit 1
  `;

  if (!row?.profile_id) {
    throw new Error('Failed to resolve the seeded creator presence context');
  }

  creatorContext = {
    profileId: row.profile_id,
  };

  return creatorContext;
}

async function resetPresenceMatches(profileId: string): Promise<void> {
  if (!sql) return;

  await sql`
    delete from dsp_artist_matches
    where creator_profile_id = ${profileId}
      and (
        external_artist_id = ${PRESENCE_SUITE_EXTERNAL_IDS[0]}
        or external_artist_id = ${PRESENCE_SUITE_EXTERNAL_IDS[1]}
        or external_artist_id = ${PRESENCE_SUITE_EXTERNAL_IDS[2]}
      )
  `;
}

async function seedPresenceMatches(profileId: string): Promise<void> {
  if (!sql) return;

  await resetPresenceMatches(profileId);

  await sql`
    insert into dsp_artist_matches (
      creator_profile_id,
      provider_id,
      external_artist_id,
      external_artist_name,
      external_artist_url,
      confidence_score,
      matching_isrc_count,
      status,
      match_source,
      confirmed_at
    ) values
      (
        ${profileId},
        'spotify',
        'spotify-suggested',
        'Spotify Suggested',
        'https://open.spotify.com/artist/spotify-suggested',
        0.9100,
        7,
        'suggested',
        'isrc_discovery',
        null
      ),
      (
        ${profileId},
        'youtube_music',
        'youtube-suggested',
        'YouTube Suggested',
        'https://music.youtube.com/channel/youtube-suggested',
        0.8300,
        3,
        'suggested',
        'musicfetch',
        null
      ),
      (
        ${profileId},
        'apple_music',
        'apple-confirmed',
        'Apple Confirmed',
        'https://music.apple.com/artist/apple-confirmed',
        0.7700,
        4,
        'confirmed',
        'manual',
        now()
      )
  `;
}

async function getMatchStatus(
  profileId: string,
  providerId: PresenceProviderId
): Promise<PresenceMatchStatus> {
  if (!sql) return null;

  const [row] = await sql<Array<{ status: PresenceMatchStatus }>>`
    select status
    from dsp_artist_matches
    where creator_profile_id = ${profileId}
      and provider_id = ${providerId}
    limit 1
  `;

  return row?.status ?? null;
}

async function signInAsCreator(page: import('@playwright/test').Page) {
  const context = await resolveCreatorContext();
  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(APP_ROUTES.PRESENCE)}`,
    {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    }
  );
  return context;
}

async function signInAsAdmin(page: import('@playwright/test').Page) {
  await page.goto(
    `/api/dev/test-auth/enter?persona=admin&redirect=${encodeURIComponent(APP_ROUTES.PRESENCE)}`,
    {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    }
  );
}

async function openPresence(page: import('@playwright/test').Page) {
  await smokeNavigateWithRetry(page, APP_ROUTES.PRESENCE, {
    timeout: 120_000,
    retries: 2,
  });
  await waitForHydration(page);
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(url => url.pathname === APP_ROUTES.PRESENCE, {
    timeout: 60_000,
  });
  await expect(
    page
      .locator(
        '[data-testid="dsp-presence-workspace"], [data-testid="presence-empty-state"]'
      )
      .first()
  ).toBeVisible({ timeout: 30_000 });
}

async function openAddPlatformDialog(
  page: import('@playwright/test').Page,
  container?: import('@playwright/test').Locator
) {
  if (container) {
    await container.getByRole('button', { name: 'Add Platform' }).click();
  } else {
    await page
      .getByRole('button', { name: 'Add platform', exact: true })
      .click();
  }
  await expect(page.getByRole('heading', { name: 'Add Platform' })).toBeVisible(
    { timeout: 15_000 }
  );
}

async function selectSpotifyInDialog(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Spotify' }).click();
  await expect(page.getByLabel('Artist name')).toBeVisible();
  await expect(page.getByLabel('Profile URL')).toBeVisible();
}

test.describe
  .serial('Presence Page @presence', () => {
    test.skip(!databaseUrl, 'Presence E2E coverage requires DATABASE_URL');
    test.skip(
      !useTestAuthBypass,
      'Presence E2E coverage requires E2E_USE_TEST_AUTH_BYPASS=1'
    );

    test.afterEach(async () => {
      if (creatorContext) {
        await resetPresenceMatches(creatorContext.profileId);
      }
    });

    test('creator can load the empty state without runtime errors and open the add-platform dialog', async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const context = await signInAsCreator(page);
        await resetPresenceMatches(context.profileId);
        await openPresence(page);

        await expect(page.getByTestId('presence-empty-state')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(
          0
        );

        await openAddPlatformDialog(page);
        await page.keyboard.press('Escape');
        await expect(
          page.getByRole('heading', { name: 'Add Platform' })
        ).toHaveCount(0);

        await assertNoCriticalErrors(getContext(), testInfo);
      } finally {
        cleanup();
      }
    });

    test('manual platform validation errors are shown inline', async ({
      page,
    }) => {
      const context = await signInAsCreator(page);
      await resetPresenceMatches(context.profileId);
      await openPresence(page);
      await openAddPlatformDialog(page);
      await selectSpotifyInDialog(page);

      const artistName = page.getByLabel('Artist name');
      const profileUrl = page.getByLabel('Profile URL');
      const submit = page.getByRole('button', { name: 'Add Platform' });

      await artistName.fill('   ');
      await profileUrl.fill('https://open.spotify.com/artist/123');
      await submit.click();
      await expect(page.getByRole('alert')).toHaveText(
        'Artist name is required'
      );

      await artistName.fill('Presence QA');
      await profileUrl.fill('not-a-valid-url');
      await submit.click();
      await expect(page.getByRole('alert')).toHaveText('Invalid URL');

      await profileUrl.fill('http://open.spotify.com/artist/123');
      await submit.click();
      await expect(page.getByRole('alert')).toHaveText('URL must use HTTPS');

      await profileUrl.fill('https://example.com/artist/123');
      await submit.click();
      await expect(page.getByRole('alert')).toHaveText(
        'URL does not match the selected platform'
      );
    });

    test('populated presence rows support row selection and Escape dismissal', async ({
      page,
    }) => {
      const context = await signInAsCreator(page);
      await seedPresenceMatches(context.profileId);
      await openPresence(page);

      await expect(
        page.getByTestId('presence-match-row-spotify')
      ).toBeVisible();
      await expect(
        page.getByTestId('presence-match-row-apple_music')
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(
        0
      );

      await page.getByTestId('presence-match-row-spotify').click();
      await expect(
        page.getByRole('button', { name: 'Confirm Match' })
      ).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: 'Confirm Match' })
      ).toHaveCount(0);

      await page.getByTestId('presence-match-row-spotify').click();
      await expect(
        page.getByRole('button', { name: 'Confirm Match' })
      ).toBeVisible();

      await page.getByTestId('presence-match-row-spotify').click();
      await expect(
        page.getByRole('button', { name: 'Confirm Match' })
      ).toHaveCount(0);
    });

    test('suggested matches can be confirmed and rejected', async ({
      page,
    }) => {
      const context = await signInAsCreator(page);
      await seedPresenceMatches(context.profileId);
      await openPresence(page);

      await page.getByTestId('presence-match-row-spotify').click();
      await page.getByRole('button', { name: 'Confirm Match' }).click();

      await expect
        .poll(() => getMatchStatus(context.profileId, 'spotify'), {
          timeout: 30_000,
        })
        .toBe('confirmed');

      await page.getByTestId('presence-match-row-youtube_music').click();
      await page.getByRole('button', { name: 'Reject' }).click();

      await expect
        .poll(() => getMatchStatus(context.profileId, 'youtube_music'), {
          timeout: 30_000,
        })
        .toBe('rejected');
    });

    test('admin sees the refresh control on presence', async ({ page }) => {
      await signInAsAdmin(page);
      await openPresence(page);

      await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Refresh' })
      ).toBeDisabled();
    });

    test('presence chaos interactions do not trigger runtime errors or leave the route', async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        const context = await signInAsCreator(page);
        await seedPresenceMatches(context.profileId);
        await openPresence(page);

        await page.getByTestId('presence-match-row-spotify').click();
        await expect(
          page.getByRole('button', { name: 'Confirm Match' })
        ).toBeVisible();
        await page.keyboard.press('Escape');

        await page
          .getByRole('button', { name: 'Toggle presence details sidebar' })
          .click();
        await expect(
          page.getByRole('button', { name: 'Confirm Match' })
        ).toBeVisible();
        await page.keyboard.press('Escape');

        await openAddPlatformDialog(page);
        await selectSpotifyInDialog(page);
        await page.getByLabel('Artist name').fill('Chaos Artist');
        await page
          .getByLabel('Profile URL')
          .fill('https://open.spotify.com/artist/chaos-artist');
        await page.keyboard.press('Escape');

        await expect(page).toHaveURL(
          url => url.pathname === APP_ROUTES.PRESENCE
        );
        await expect(
          page.getByRole('heading', { name: 'Add Platform' })
        ).toHaveCount(0);
        await assertNoCriticalErrors(getContext(), testInfo);
      } finally {
        cleanup();
      }
    });
  });
