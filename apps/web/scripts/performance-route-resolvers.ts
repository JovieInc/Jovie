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

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  return databaseUrl && databaseUrl.length > 0 ? databaseUrl : null;
}

function getSqlClient() {
  const databaseUrl = getDatabaseUrl();
  return databaseUrl ? neon(databaseUrl) : null;
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

async function queryProfileHandle(handle: string) {
  const sql = getSqlClient();
  if (!sql) {
    return null;
  }

  const rows = await sql<Array<{ username_normalized: string }>>`
    select username_normalized
    from creator_profiles
    where username_normalized = ${handle.toLowerCase()}
    limit 1
  `;

  return rows[0]?.username_normalized ?? null;
}

async function queryActiveProfile() {
  const sql = getSqlClient();
  const clerkUserId = process.env.E2E_CLERK_USER_ID?.trim();

  if (!sql || !clerkUserId) {
    return null;
  }

  const rows = await sql<Array<{ id: string; username_normalized: string }>>`
    select cp.id, cp.username_normalized
    from users u
    join creator_profiles cp on cp.id = u.active_profile_id
    where u.clerk_id = ${clerkUserId}
    limit 1
  `;

  return rows[0] ?? null;
}

async function queryExistingConversationId(profileId: string) {
  const sql = getSqlClient();
  if (!sql) {
    return null;
  }

  const rows = await sql<Array<{ id: string }>>`
    select id
    from chat_conversations
    where creator_profile_id = ${profileId}
    order by updated_at desc
    limit 1
  `;

  return rows[0]?.id ?? null;
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
    await page.goto(`${baseUrl}${APP_ROUTES.DASHBOARD_RELEASES}`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForSelector('[data-testid="release-row"]', {
      timeout: 15_000,
    });
    await page.click('[data-testid="release-row"]');
    await page.waitForSelector('[data-testid="release-sidebar"]', {
      timeout: 15_000,
    });
    await page.click('button:has-text("Tasks")');
    await page.waitForSelector('[data-testid="release-tasks-card"]', {
      timeout: 15_000,
    });
    await page.click('button:has-text("Open")');
    await page.waitForURL('**/tasks', {
      timeout: 15_000,
    });

    const finalUrl = new URL(page.url());
    return `${finalUrl.pathname}${finalUrl.search}`;
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
  const activeProfile = await queryActiveProfile();
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
  const activeProfile = await queryActiveProfile();

  if (!sql || !activeProfile) {
    const resolvedPath = await resolveReleaseTasksViaApp(context);
    if (resolvedPath) {
      return resolvedPath;
    }

    throw new Error(
      'DATABASE_URL and E2E_CLERK_USER_ID are required to resolve release tasks.'
    );
  }

  const releases = await sql<Array<{ id: string }>>`
    select id
    from discog_releases
    where creator_profile_id = ${activeProfile.id}
    order by release_date desc nulls last, created_at desc
    limit 1
  `;

  const releaseId = releases[0]?.id;
  if (!releaseId) {
    const resolvedPath = await resolveReleaseTasksViaApp(context);
    if (resolvedPath) {
      return resolvedPath;
    }

    throw new Error('No seeded release found for the active E2E user.');
  }

  return replaceRouteToken(route.path, 'releaseId', releaseId);
}
