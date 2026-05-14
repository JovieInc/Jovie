import { neon } from '@neondatabase/serverless';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { APP_ROUTES } from '@/constants/routes';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';

const LAYOUT_TASK_TITLE = 'Layout QA task fixture';
const PERSONA_PROFILE_USERNAMES = {
  admin: 'browse-admin-user',
  creator: 'browse-test-user',
  'creator-ready': 'browse-ready-user',
} as const;
const TASK_ROW_SELECTOR =
  '[data-testid^="task-list-row-"]:not([data-testid^="task-list-row-meta-"])';
const TASK_BOARD_CARD_SELECTOR = '[data-testid^="task-board-card-"]';
const TASK_VIEW_MODE_STORAGE_KEY = 'jovie-dashboard-tasks-view-mode';
const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 960 },
] as const;

function resolveLayoutProfileUsername(): string {
  const persona = process.env.E2E_TEST_AUTH_PERSONA?.trim();
  if (
    persona === 'admin' ||
    persona === 'creator' ||
    persona === 'creator-ready'
  ) {
    return PERSONA_PROFILE_USERNAMES[persona];
  }

  return 'e2e-test-user';
}

async function stubPassiveTracking(page: Page): Promise<void> {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

async function ensureTaskExists(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for tasks layout seeding.');
  }

  const profileUsername = resolveLayoutProfileUsername();
  const db = drizzle(neon(databaseUrl), {
    schema: { creatorProfiles, tasks },
  });
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.username, profileUsername))
    .limit(1);

  if (!profile) {
    throw new Error(`Could not find the ${profileUsername} creator profile.`);
  }

  const [existingTask] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.creatorProfileId, profile.id),
        eq(tasks.title, LAYOUT_TASK_TITLE),
        isNull(tasks.deletedAt)
      )
    )
    .limit(1);

  const [firstPosition] = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(eq(tasks.creatorProfileId, profile.id))
    .orderBy(asc(tasks.position))
    .limit(1);
  const fixturePosition = (firstPosition?.position ?? 0) - 1024;

  if (!existingTask) {
    const [lastTaskNumber] = await db
      .select({ taskNumber: tasks.taskNumber })
      .from(tasks)
      .where(eq(tasks.creatorProfileId, profile.id))
      .orderBy(desc(tasks.taskNumber))
      .limit(1);

    await db.insert(tasks).values({
      creatorProfileId: profile.id,
      taskNumber: (lastTaskNumber?.taskNumber ?? 0) + 1,
      title: LAYOUT_TASK_TITLE,
      description: 'Used by the Playwright tasks layout spec.',
      status: 'backlog',
      priority: 'high',
      assigneeKind: 'human',
      agentStatus: 'approved',
      position: fixturePosition,
      metadata: {},
    });
  } else {
    await db
      .update(tasks)
      .set({
        status: 'backlog',
        priority: 'high',
        assigneeKind: 'human',
        agentStatus: 'approved',
        position: fixturePosition,
        deletedAt: null,
      })
      .where(eq(tasks.id, existingTask.id));
  }

  return LAYOUT_TASK_TITLE;
}

function getVisibleTaskTitleEditor(page: Page) {
  return page.getByLabel('Task title').first();
}

function getTaskRowByTitle(page: Page, taskTitle: string) {
  return page.locator(TASK_ROW_SELECTOR).filter({ hasText: taskTitle }).first();
}

function getTaskBoardCardByTitle(page: Page, taskTitle: string) {
  return page
    .locator(TASK_BOARD_CARD_SELECTOR)
    .filter({ hasText: taskTitle })
    .first();
}

async function openTaskRowByTitle(
  page: Page,
  taskTitle: string
): Promise<ReturnType<Page['locator']>> {
  const row = getTaskRowByTitle(page, taskTitle);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.click();
  return row;
}

async function setTaskViewMode(
  page: Page,
  viewMode: 'board' | 'list'
): Promise<void> {
  await page
    .evaluate(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: TASK_VIEW_MODE_STORAGE_KEY, value: viewMode }
    )
    .catch(() => undefined);

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: TASK_VIEW_MODE_STORAGE_KEY, value: viewMode }
  );
}

async function assertTasksBoardLayout(
  page: Page,
  testInfo: TestInfo,
  viewport: (typeof VIEWPORTS)[number]
): Promise<void> {
  const taskTitle = await ensureTaskExists();

  await setTaskViewMode(page, 'board');
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  await page.goto(APP_ROUTES.DASHBOARD_TASKS, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByTestId('tasks-workspace')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('tasks-board')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('tasks-board-column-backlog')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('tasks-board-column-todo')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('tasks-board-column-in_progress')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(taskTitle).first()).toBeVisible({
    timeout: 30_000,
  });

  const boardCard = getTaskBoardCardByTitle(page, taskTitle);
  await expect(boardCard).toBeVisible();
  await boardCard.click();
  await expect(getVisibleTaskTitleEditor(page)).toHaveValue(taskTitle, {
    timeout: 15_000,
  });

  const [workspaceBox, boardBox, fitsWithoutPageScroll] = await Promise.all([
    page.getByTestId('tasks-workspace').boundingBox(),
    page.getByTestId('tasks-board').boundingBox(),
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    ),
  ]);

  expect(workspaceBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  expect(fitsWithoutPageScroll).toBe(true);
  expect(boardBox?.x ?? 0).toBeGreaterThanOrEqual((workspaceBox?.x ?? 0) - 0.5);
  expect((boardBox?.x ?? 0) + (boardBox?.width ?? 0)).toBeLessThanOrEqual(
    (workspaceBox?.x ?? 0) + (workspaceBox?.width ?? 0) + 0.5
  );

  await testInfo.attach(`tasks-board-${viewport.name}`, {
    body: await page.getByTestId('tasks-workspace').screenshot(),
    contentType: 'image/png',
  });
}

async function assertTasksLayout(
  page: Page,
  testInfo: TestInfo,
  viewport: (typeof VIEWPORTS)[number]
): Promise<void> {
  const taskTitle = await ensureTaskExists();

  await setTaskViewMode(page, 'list');
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  await page.goto(APP_ROUTES.DASHBOARD_TASKS, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByTestId('tasks-workspace')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('task-list-pane')).toBeVisible({
    timeout: 30_000,
  });
  const targetRow = await openTaskRowByTitle(page, taskTitle);

  const listPane = page.getByTestId('task-list-pane');
  const documentPane = page.getByTestId('task-document-pane');
  const dashboardHeader = page.getByTestId('dashboard-header');
  const subheader = page.getByTestId('tasks-workspace-subheader');

  await expect(listPane).toBeVisible();
  await expect(documentPane).toBeVisible();
  await expect(targetRow).toBeVisible();
  await expect(getVisibleTaskTitleEditor(page)).toHaveValue(taskTitle);

  const [headerBox, subheaderBox, paneBox, rowBox, fitsWithoutScroll] =
    await Promise.all([
      dashboardHeader.boundingBox(),
      subheader.boundingBox(),
      listPane.boundingBox(),
      targetRow.boundingBox(),
      listPane.evaluate(node => node.scrollWidth <= node.clientWidth + 1),
    ]);

  expect(headerBox).not.toBeNull();
  expect(subheaderBox).not.toBeNull();
  expect(paneBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  expect(fitsWithoutScroll).toBe(true);

  expect(
    Math.abs((headerBox?.height ?? 0) - (subheaderBox?.height ?? 0))
  ).toBeLessThanOrEqual(1);
  expect(rowBox?.x ?? 0).toBeGreaterThanOrEqual((paneBox?.x ?? 0) - 0.5);
  expect((rowBox?.x ?? 0) + (rowBox?.width ?? 0)).toBeLessThanOrEqual(
    (paneBox?.x ?? 0) + (paneBox?.width ?? 0) + 0.5
  );

  await testInfo.attach(`tasks-layout-${viewport.name}`, {
    body: await page.getByTestId('tasks-workspace').screenshot(),
    contentType: 'image/png',
  });
}

test.describe('Tasks layout', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1' &&
      !hasClerkCredentials()
    ) {
      testInfo.skip();
      return;
    }

    await stubPassiveTracking(page);
    await ensureSignedInUser(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`keeps the board contained at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await assertTasksBoardLayout(page, testInfo, viewport);
    });

    test(`keeps the list fallback contained at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await assertTasksLayout(page, testInfo, viewport);
    });
  }
});
