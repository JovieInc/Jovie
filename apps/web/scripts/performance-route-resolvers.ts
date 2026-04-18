import { neon } from '@neondatabase/serverless';
import { type Browser, type BrowserContext, chromium } from '@playwright/test';
import { APP_ROUTES } from '../constants/routes';
import type {
  PerfResolveContext,
  PerfRouteDefinition,
} from './performance-route-manifest';

const DEFAULT_PUBLIC_RELEASE_SLUG = 'neon-skyline';
const DEFAULT_PUBLIC_TRACK_SLUG = 'neon-skyline';
const PERF_CHAT_THREAD_TITLE = 'Performance Budget Thread';
const PERF_RELEASE_SLUG = 'performance-budget-release';
const PERF_RELEASE_TITLE = 'Performance Budget Release';
const PERF_ROUTE_DB_TIMEOUT_MS = Number.parseInt(
  process.env.PERF_ROUTE_DB_TIMEOUT_MS || '',
  10
);
const RELEASE_TASKS_RESOLUTION_ERROR =
  'Release tasks require either DATABASE_URL with a resolvable active profile or authenticated authCookies for the app fallback.';

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  return databaseUrl && databaseUrl.length > 0 ? databaseUrl : null;
}

function getSqlClient() {
  const databaseUrl = getDatabaseUrl();
  return databaseUrl ? neon(databaseUrl) : null;
}

function resolveClerkUserId(
  authCookies?: readonly { name?: string; value?: string }[]
) {
  const envClerkUserId = process.env.E2E_CLERK_USER_ID?.trim();
  if (envClerkUserId) {
    return envClerkUserId;
  }
  const bypassClerkUserId = authCookies
    ?.find(cookie => cookie.name === '__e2e_test_user_id')
    ?.value?.trim();
  return bypassClerkUserId && bypassClerkUserId.length > 0
    ? bypassClerkUserId
    : null;
}

function replaceRouteToken(
  template: string,
  token: string,
  value: string | undefined
) {
  if (!value) {
    return template;
  }

  return template.replaceAll(`[${token}]`, value);
}

async function withResolverTimeout<T>(
  label: string,
  operation: Promise<T>,
  fallback: T | null = null
) {
  const timeoutMs = Number.isFinite(PERF_ROUTE_DB_TIMEOUT_MS)
    ? PERF_ROUTE_DB_TIMEOUT_MS
    : 5_000;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const guardedOperation = operation.catch(error => {
    console.warn(
      `[perf-route-resolvers] ${label} failed: ${(error as Error).message}`
    );
    return fallback;
  });
  const timeoutPromise = new Promise<T | null>(resolve => {
    timeoutId = setTimeout(() => {
      console.warn(
        `[perf-route-resolvers] ${label} timed out after ${timeoutMs}ms`
      );
      resolve(fallback);
    }, timeoutMs);
  });

  try {
    return await Promise.race([guardedOperation, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function resolveReleaseTasksPathname(pathname: string, search = '') {
  const releaseTasksPrefix = `${APP_ROUTES.DASHBOARD_RELEASES}/`;
  if (
    !pathname.startsWith(releaseTasksPrefix) ||
    !pathname.endsWith('/tasks')
  ) {
    return null;
  }

  const releaseId = pathname
    .slice(releaseTasksPrefix.length, -'/tasks'.length)
    .replace(/^\/+|\/+$/g, '');

  return releaseId ? `${pathname}${search}` : null;
}

async function queryProfileHandle(handle: string) {
  const sql = getSqlClient();
  if (!sql) {
    return null;
  }

  const rows = await withResolverTimeout(
    `queryProfileHandle(${handle})`,
    sql<Array<{ username_normalized: string }>>`
      select username_normalized
      from creator_profiles
      where username_normalized = ${handle.toLowerCase()}
      limit 1
    `,
    [] as Array<{ username_normalized: string }>
  );

  return rows[0]?.username_normalized ?? null;
}

async function queryActiveProfile(clerkUserId?: string | null) {
  const sql = getSqlClient();
  const resolvedClerkUserId =
    clerkUserId ?? process.env.E2E_CLERK_USER_ID?.trim() ?? null;

  if (!sql || !resolvedClerkUserId) {
    return null;
  }

  const rows = await withResolverTimeout(
    `queryActiveProfile(${resolvedClerkUserId})`,
    sql<Array<{ id: string; username_normalized: string }>>`
      select cp.id, cp.username_normalized
      from users u
      join creator_profiles cp on cp.id = u.active_profile_id
      where u.clerk_id = ${resolvedClerkUserId}
      limit 1
    `,
    [] as Array<{ id: string; username_normalized: string }>
  );

  return rows[0] ?? null;
}

async function queryExistingConversationId(profileId: string) {
  const sql = getSqlClient();
  if (!sql) {
    return null;
  }

  const rows = await withResolverTimeout(
    `queryExistingConversationId(${profileId})`,
    sql<Array<{ id: string }>>`
      select id
      from chat_conversations
      where creator_profile_id = ${profileId}
      order by updated_at desc
      limit 1
    `,
    [] as Array<{ id: string }>
  );

  return rows[0]?.id ?? null;
}

async function ensurePerfRelease(profileId: string) {
  const sql = getSqlClient();
  if (!sql) {
    return null;
  }

  const existing = await withResolverTimeout(
    `ensurePerfRelease.select(${profileId})`,
    sql<Array<{ id: string }>>`
      select id
      from discog_releases
      where creator_profile_id = ${profileId}
        and slug = ${PERF_RELEASE_SLUG}
      limit 1
    `,
    [] as Array<{ id: string }>
  );

  if (existing[0]?.id) {
    return existing[0].id;
  }

  const inserted = await withResolverTimeout(
    `ensurePerfRelease.insert(${profileId})`,
    sql<Array<{ id: string }>>`
      insert into discog_releases (
        creator_profile_id,
        title,
        slug,
        release_type,
        release_date,
        status,
        total_tracks,
        source_type
      )
      values (
        ${profileId},
        ${PERF_RELEASE_TITLE},
        ${PERF_RELEASE_SLUG},
        'single',
        now(),
        'released',
        1,
        'manual'
      )
      returning id
    `,
    [] as Array<{ id: string }>
  );

  return inserted[0]?.id ?? null;
}

async function createConversationViaApp(context: PerfResolveContext) {
  if (context.authCookies.length === 0) {
    return null;
  }

  let browser: Browser | null = null;
  let pageContext: BrowserContext | null = null;
  const baseUrl = context.baseUrl.replace(/\/$/, '');

  try {
    browser = await chromium.launch();
    pageContext = await browser.newContext();
    await pageContext.addCookies([...context.authCookies]);
    const page = await pageContext.newPage();
    await page.goto(`${baseUrl}${APP_ROUTES.CHAT}`, {
      waitUntil: 'domcontentloaded',
    });

    const existing = await page.evaluate(async () => {
      const response = await fetch('/api/chat/conversations?limit=1', {
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        conversations?: Array<{ id?: string }>;
      };
      return payload.conversations?.[0]?.id ?? null;
    });

    if (existing) {
      return existing;
    }

    const created = await page.evaluate(
      async input => {
        const response = await fetch('/api/chat/conversations', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title: input.title }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          conversation?: { id?: string };
        };
        return payload.conversation?.id ?? null;
      },
      {
        title: PERF_CHAT_THREAD_TITLE,
      }
    );

    return created ?? null;
  } finally {
    await pageContext?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function resolveActiveProfileViaApp(context: PerfResolveContext) {
  if (context.authCookies.length === 0) {
    return null;
  }

  let browser: Browser | null = null;
  let pageContext: BrowserContext | null = null;
  const baseUrl = context.baseUrl.replace(/\/$/, '');

  try {
    browser = await chromium.launch();
    pageContext = await browser.newContext();
    await pageContext.addCookies([...context.authCookies]);
    const page = await pageContext.newPage();
    await page.goto(`${baseUrl}${APP_ROUTES.DASHBOARD}`, {
      waitUntil: 'domcontentloaded',
    });

    const profile = await page.evaluate(async () => {
      const response = await fetch('/api/dashboard/profile', {
        credentials: 'include',
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        profile?: {
          id?: string;
          usernameNormalized?: string | null;
          username_normalized?: string | null;
        };
      };

      const id = payload.profile?.id ?? null;
      const usernameNormalized =
        payload.profile?.usernameNormalized ??
        payload.profile?.username_normalized ??
        null;

      return id && usernameNormalized
        ? { id, username_normalized: usernameNormalized }
        : null;
    });

    return profile;
  } finally {
    await pageContext?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function resolveReleaseTasksViaApp(context: PerfResolveContext) {
  if (context.authCookies.length === 0) {
    return null;
  }

  let browser: Browser | null = null;
  let pageContext: BrowserContext | null = null;
  const baseUrl = context.baseUrl.replace(/\/$/, '');

  try {
    browser = await chromium.launch();
    pageContext = await browser.newContext();
    await pageContext.addCookies([...context.authCookies]);
    const page = await pageContext.newPage();
    const originalViewport = page.viewportSize();
    if (originalViewport) {
      await page.setViewportSize({
        width: 390,
        height: originalViewport.height,
      });
    }

    await page.goto(`${baseUrl}${APP_ROUTES.DASHBOARD_RELEASES}`, {
      waitUntil: 'domcontentloaded',
    });

    await page
      .waitForLoadState('domcontentloaded', { timeout: 10_000 })
      .catch(() => undefined);

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

    const finalUrl = new URL(page.url());
    return resolveReleaseTasksPathname(finalUrl.pathname, finalUrl.search);
  } finally {
    await pageContext?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function resolveSeedProfileHandle(seedProfile?: string) {
  const requestedHandle =
    seedProfile === 'active-user'
      ? process.env.PERF_ROUTE_ACTIVE_USER_HANDLE?.trim() || null
      : seedProfile === 'tim'
        ? process.env.PERF_ROUTE_FOUNDER_HANDLE?.trim() ||
          process.env.PERF_BUDGET_USERNAME?.trim() ||
          'tim'
        : seedProfile === 'dualipa'
          ? process.env.PERF_ROUTE_MUSIC_HANDLE?.trim() || 'dualipa'
          : seedProfile === 'testartist'
            ? process.env.PERF_ROUTE_TIPPING_HANDLE?.trim() || 'testartist'
            : seedProfile?.trim() || null;

  if (seedProfile === 'active-user') {
    const activeProfile = await queryActiveProfile();
    return (
      activeProfile?.username_normalized ??
      requestedHandle ??
      process.env.PERF_BUDGET_USERNAME?.trim() ??
      'musicmaker'
    );
  }

  const handle =
    requestedHandle ?? process.env.PERF_BUDGET_USERNAME?.trim() ?? 'tim';
  const existing = await queryProfileHandle(handle);
  if (existing) {
    return existing;
  }

  if (handle === 'tim') {
    return process.env.PERF_ROUTE_MUSIC_HANDLE?.trim() || 'dualipa';
  }

  return handle;
}

export async function resolveSeededProfilePath(
  route: PerfRouteDefinition
): Promise<string> {
  const username = await resolveSeedProfileHandle(route.seedProfile);
  return replaceRouteToken(route.path, 'username', username);
}

export async function resolveSeededProfileModePath(
  route: PerfRouteDefinition
): Promise<string> {
  const username = await resolveSeedProfileHandle(route.seedProfile);
  return replaceRouteToken(route.path, 'username', username);
}

export async function resolveSeededPublicReleasePath(
  route: PerfRouteDefinition
): Promise<string> {
  const username = await resolveSeedProfileHandle(route.seedProfile);
  return replaceRouteToken(
    replaceRouteToken(route.path, 'username', username),
    'slug',
    DEFAULT_PUBLIC_RELEASE_SLUG
  );
}

export async function resolveSeededPublicTrackPath(
  route: PerfRouteDefinition
): Promise<string> {
  const username = await resolveSeedProfileHandle(route.seedProfile);
  return replaceRouteToken(
    replaceRouteToken(
      replaceRouteToken(route.path, 'username', username),
      'slug',
      DEFAULT_PUBLIC_RELEASE_SLUG
    ),
    'trackSlug',
    DEFAULT_PUBLIC_TRACK_SLUG
  );
}

export async function resolveSeededPublicCatchAllPath(
  route: PerfRouteDefinition
): Promise<string> {
  const username = await resolveSeedProfileHandle(route.seedProfile);
  return replaceRouteToken(route.path, 'username', username);
}

export async function resolveActiveProfileOnboardingPath(
  route: PerfRouteDefinition
): Promise<string> {
  const username = await resolveSeedProfileHandle('active-user');
  return replaceRouteToken(route.path, 'username', username);
}

export async function resolveChatConversationPerfPath(
  route: PerfRouteDefinition,
  context: PerfResolveContext
): Promise<string> {
  const activeProfile =
    (await queryActiveProfile(resolveClerkUserId(context.authCookies))) ??
    (await resolveActiveProfileViaApp(context));
  const existingConversationId = activeProfile
    ? await queryExistingConversationId(activeProfile.id)
    : null;
  const conversationId =
    existingConversationId ?? (await createConversationViaApp(context));

  if (!conversationId) {
    return APP_ROUTES.CHAT;
  }

  return replaceRouteToken(route.path, 'id', conversationId);
}

export async function resolveReleaseTasksPerfPath(
  route: PerfRouteDefinition,
  context: PerfResolveContext
): Promise<string> {
  const sql = getSqlClient();
  if (!sql) {
    const resolvedPath = await resolveReleaseTasksViaApp(context);
    if (resolvedPath) {
      return resolvedPath;
    }

    throw new Error(RELEASE_TASKS_RESOLUTION_ERROR);
  }

  const activeProfile =
    (await queryActiveProfile(resolveClerkUserId(context.authCookies))) ??
    (await resolveActiveProfileViaApp(context));

  if (!activeProfile) {
    const resolvedPath = await resolveReleaseTasksViaApp(context);
    if (resolvedPath) {
      return resolvedPath;
    }

    throw new Error(RELEASE_TASKS_RESOLUTION_ERROR);
  }

  const releases = await withResolverTimeout(
    `resolveReleaseTasksPerfPath.select(${activeProfile.id})`,
    sql<Array<{ id: string }>>`
      select id
      from discog_releases
      where creator_profile_id = ${activeProfile.id}
      order by release_date desc nulls last, created_at desc
      limit 1
    `,
    [] as Array<{ id: string }>
  );

  const releaseId = releases[0]?.id;
  const resolvedReleaseId =
    releaseId ?? (await ensurePerfRelease(activeProfile.id));
  if (!resolvedReleaseId) {
    const resolvedPath = await resolveReleaseTasksViaApp(context);
    if (resolvedPath) {
      return resolvedPath;
    }

    throw new Error('No seeded release found for the active E2E user.');
  }

  return replaceRouteToken(route.path, 'releaseId', resolvedReleaseId);
}
