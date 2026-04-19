import { neon } from '@neondatabase/serverless';
import type { Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { TEST_USER_ID_COOKIE } from '@/lib/auth/test-mode';

interface ResolverProfile {
  id: string;
  userId: string | null;
  username: string;
  usernameNormalized: string;
  displayName: string | null;
  avatarUrl: string | null;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  spotifyId: string | null;
  appleMusicId: string | null;
  youtubeMusicId: string | null;
  isClaimed: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function profileIsPublishable(profile: ResolverProfile): boolean {
  return Boolean(
    (profile.displayName && profile.displayName.trim()) ||
      (profile.avatarUrl && profile.avatarUrl.trim())
  );
}

function selectDashboardProfile(profiles: ResolverProfile[]): ResolverProfile {
  const claimed = profiles.find(
    profile => profile.isClaimed && profileIsPublishable(profile)
  );
  if (claimed) return claimed;

  const publishable = profiles.find(profileIsPublishable);
  if (publishable) return publishable;

  return [...profiles].sort((a, b) => {
    const aUpdated = a.updatedAt ? a.updatedAt.getTime() : 0;
    const bUpdated = b.updatedAt ? b.updatedAt.getTime() : 0;
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;

    const aCreated = a.createdAt ? a.createdAt.getTime() : 0;
    const bCreated = b.createdAt ? b.createdAt.getTime() : 0;
    return bCreated - aCreated;
  })[0];
}

interface ConversationResponse {
  readonly conversation?: {
    readonly id?: string;
  };
}

interface ConversationsListResponse {
  readonly conversations?: ReadonlyArray<{
    readonly id?: string;
  }>;
}

interface BrowserFetchInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

async function fetchJsonFromPage<T>(
  page: Page,
  input: string,
  init?: BrowserFetchInit
): Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly data: T;
}> {
  return page.evaluate(
    async ({ target, requestInit }) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15_000);

      try {
        const response = await fetch(target, {
          method: requestInit?.method,
          headers: requestInit?.headers,
          body: requestInit?.body,
          signal: controller.signal,
        });
        const rawBody = await response.text().catch(() => '');
        let data = {} as T;
        if (rawBody.trim().length > 0) {
          try {
            data = JSON.parse(rawBody) as T;
          } catch {
            data = {} as T;
          }
        }

        return {
          ok: response.ok,
          status: response.status,
          data,
        };
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    { target: input, requestInit: init }
  );
}

export async function resolveChatConversationPath(page: Page): Promise<string> {
  const existing = await fetchJsonFromPage<ConversationsListResponse>(
    page,
    '/api/chat/conversations?limit=1'
  );

  const existingConversationId = existing.data.conversations?.[0]?.id;
  if (existing.ok && existingConversationId) {
    return `${APP_ROUTES.CHAT}/${existingConversationId}`;
  }

  const created = await fetchJsonFromPage<ConversationResponse>(
    page,
    '/api/chat/conversations',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Dashboard QA thread',
      }),
    }
  );

  const createdConversationId = created.data.conversation?.id;
  if (!created.ok || !createdConversationId) {
    throw new Error(
      `Unable to resolve chat conversation route (status ${created.status})`
    );
  }

  return `${APP_ROUTES.CHAT}/${createdConversationId}`;
}

export async function resolveReleaseTasksPathFromPage(
  page: Page
): Promise<string> {
  const originalViewport = page.viewportSize();
  if (originalViewport) {
    await page.setViewportSize({ width: 390, height: originalViewport.height });
  }

  await page.goto(APP_ROUTES.DASHBOARD_RELEASES, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page
    .waitForLoadState('domcontentloaded', { timeout: 10_000 })
    .catch(() => {});

  const mobileRowTestId = await page
    .locator('[data-testid^="mobile-release-row-"]')
    .first()
    .getAttribute('data-testid')
    .catch(() => null);

  if (originalViewport) {
    await page.setViewportSize(originalViewport);
  }

  const mobileReleaseId = mobileRowTestId?.replace('mobile-release-row-', '');
  if (mobileReleaseId) {
    return `${APP_ROUTES.DASHBOARD_RELEASES}/${mobileReleaseId}/tasks`;
  }

  const authCookies = await page.context().cookies();
  const cookieUserId = authCookies.find(
    cookie => cookie.name === TEST_USER_ID_COOKIE
  )?.value;
  const clerkUserId =
    cookieUserId?.trim() || process.env.E2E_CLERK_USER_ID?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!clerkUserId) {
    throw new Error('E2E_CLERK_USER_ID is required to resolve release tasks');
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to resolve release tasks');
  }

  const sql = neon(databaseUrl);
  const [user] = await sql<Array<{ id: string }>>`
    select id from users where clerk_id = ${clerkUserId} limit 1
  `;

  if (!user?.id) {
    throw new Error('E2E test user was not found');
  }

  const profiles = await sql<
    Array<{
      id: string;
      user_id: string | null;
      username: string;
      username_normalized: string;
      display_name: string | null;
      avatar_url: string | null;
      spotify_url: string | null;
      apple_music_url: string | null;
      youtube_url: string | null;
      spotify_id: string | null;
      apple_music_id: string | null;
      youtube_music_id: string | null;
      is_claimed: boolean | null;
      created_at: string | null;
      updated_at: string | null;
    }>
  >`
    select
      id,
      user_id,
      username,
      username_normalized,
      display_name,
      avatar_url,
      spotify_url,
      apple_music_url,
      youtube_url,
      spotify_id,
      apple_music_id,
      youtube_music_id,
      is_claimed,
      created_at,
      updated_at
    from creator_profiles
    where user_id = ${user.id}
    order by created_at asc
  `;

  if (profiles.length === 0) {
    throw new Error('E2E test user does not own any creator profiles');
  }

  const selectedProfile = selectDashboardProfile(
    profiles.map(profile => ({
      id: profile.id,
      userId: profile.user_id,
      username: profile.username,
      usernameNormalized: profile.username_normalized,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
      spotifyUrl: profile.spotify_url,
      appleMusicUrl: profile.apple_music_url,
      youtubeUrl: profile.youtube_url,
      spotifyId: profile.spotify_id,
      appleMusicId: profile.apple_music_id,
      youtubeMusicId: profile.youtube_music_id,
      isClaimed: Boolean(profile.is_claimed),
      createdAt: profile.created_at ? new Date(profile.created_at) : null,
      updatedAt: profile.updated_at ? new Date(profile.updated_at) : null,
    }))
  );

  const [release] = await sql<Array<{ id: string }>>`select id
      from discog_releases
      where creator_profile_id = ${selectedProfile.id}
      order by release_date desc nulls last, created_at desc
      limit 1`;

  if (!release?.id) {
    throw new Error('No seeded release found for the E2E test user');
  }

  return `${APP_ROUTES.DASHBOARD_RELEASES}/${release.id}/tasks`;
}
