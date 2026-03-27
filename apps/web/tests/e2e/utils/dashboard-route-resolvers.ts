import { neon } from '@neondatabase/serverless';
import type { Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';

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

async function fetchJsonFromPage<T>(
  page: Page,
  input: string,
  init?: RequestInit
): Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly data: T;
}> {
  return page.evaluate(
    async ({ requestInput, requestInit }) => {
      const response = await fetch(requestInput, {
        credentials: 'same-origin',
        ...requestInit,
      });
      const data = (await response.json().catch(() => ({}))) as T;
      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    },
    { requestInput: input, requestInit: init }
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
  _page: Page
): Promise<string> {
  const clerkUserId = process.env.E2E_CLERK_USER_ID?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!clerkUserId) {
    throw new Error('E2E_CLERK_USER_ID is required to resolve release tasks');
  }
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to resolve release tasks');
  }

  const sql = neon(databaseUrl);
  const [user] = await sql<
    Array<{ active_profile_id: string | null }>
  >`select active_profile_id from users where clerk_id = ${clerkUserId} limit 1`;

  if (!user?.active_profile_id) {
    throw new Error('E2E test user does not have an active profile');
  }

  const [release] = await sql<Array<{ id: string }>>`select id
      from discog_releases
      where creator_profile_id = ${user.active_profile_id}
      order by release_date desc nulls last, created_at desc
      limit 1`;

  if (!release?.id) {
    throw new Error('No seeded release found for the E2E test user');
  }

  return `${APP_ROUTES.DASHBOARD_RELEASES}/${release.id}/tasks`;
}
