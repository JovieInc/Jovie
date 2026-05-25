import { neon } from '@neondatabase/serverless';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { APP_ROUTES } from '@/constants/routes';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
} from '@/lib/auth/test-mode';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';
import type {
  TaskAssigneeKind,
  TaskPriority,
  TaskStatus,
} from '@/lib/tasks/types';
import {
  ensureSignedInUser,
  hasClerkCredentials,
  resolveBypassFallbackUserId,
} from '../helpers/clerk-auth';

const LAYOUT_TASK_TITLE = 'Layout QA task fixture';
const TASKS_LAYOUT_PERSONA = 'creator-ready';
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
interface LayoutTaskFixture {
  readonly id: string;
  readonly title: string;
}

interface SeededTaskState {
  readonly title: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeKind: TaskAssigneeKind;
}

function resolveLayoutProfileUsername(): string {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
    return PERSONA_PROFILE_USERNAMES[TASKS_LAYOUT_PERSONA];
  }

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

async function seedTaskLayoutBypassSession(page: Page): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  const userId = resolveBypassFallbackUserId(TASKS_LAYOUT_PERSONA);

  if (!userId) {
    throw new Error(
      'E2E_CLERK_USER_ID is required for task layout bypass auth seeding.'
    );
  }

  await page.context().addCookies([
    {
      name: TEST_MODE_COOKIE,
      value: TEST_AUTH_BYPASS_MODE,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_USER_ID_COOKIE,
      value: userId,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: TEST_PERSONA_COOKIE,
      value: TASKS_LAYOUT_PERSONA,
      url: baseUrl,
      sameSite: 'Lax',
    },
  ]);
}

async function ensureTaskExists(): Promise<LayoutTaskFixture> {
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
        or(
          eq(tasks.title, LAYOUT_TASK_TITLE),
          eq(tasks.description, 'Used by the Playwright tasks layout spec.')
        ),
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

    const [insertedTask] = await db
      .insert(tasks)
      .values({
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
      })
      .returning({ id: tasks.id });

    if (!insertedTask) {
      throw new Error('Failed to seed the tasks layout fixture.');
    }

    return { id: insertedTask.id, title: LAYOUT_TASK_TITLE };
  } else {
    await db
      .update(tasks)
      .set({
        title: LAYOUT_TASK_TITLE,
        description: 'Used by the Playwright tasks layout spec.',
        status: 'backlog',
        priority: 'high',
        assigneeKind: 'human',
        agentStatus: 'approved',
        position: fixturePosition,
        deletedAt: null,
      })
      .where(eq(tasks.id, existingTask.id));

    return { id: existingTask.id, title: LAYOUT_TASK_TITLE };
  }
}

async function getSeededTaskState(
  taskId: string
): Promise<SeededTaskState | null> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for tasks layout assertions.');
  }

  const db = drizzle(neon(databaseUrl), {
    schema: { tasks },
  });
  const [task] = await db
    .select({
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      assigneeKind: tasks.assigneeKind,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
    .limit(1);

  return task ?? null;
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

async function clearTaskViewMode(page: Page): Promise<void> {
  await page
    .evaluate(key => {
      window.localStorage.removeItem(key);
    }, TASK_VIEW_MODE_STORAGE_KEY)
    .catch(() => undefined);

  await page.addInitScript(
    ({ key }) => {
      window.localStorage.removeItem(key);
    },
    { key: TASK_VIEW_MODE_STORAGE_KEY }
  );
}

async function gotoTasksRoute(page: Page): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      try {
        await page.goto(APP_ROUTES.TASKS, {
          waitUntil: 'commit',
          timeout: 180_000,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          !message.includes('ERR_ABORTED') &&
          !message.includes('frame was detached')
        ) {
          throw error;
        }
      }

      await expect(page).toHaveURL(APP_ROUTES.TASKS, {
        timeout: 30_000,
      });
      await expect(page.getByTestId('tasks-workspace')).toBeVisible({
        timeout: 90_000,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await page.waitForTimeout(attempt * 1000);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to navigate to the canonical tasks route.');
}

async function fillTaskSearch(page: Page, taskTitle: string): Promise<void> {
  const searchbox = page.getByRole('searchbox', { name: 'Search tasks' });
  const searchboxVisible = await searchbox
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!searchboxVisible) {
    const searchButton = page.getByRole('button', { name: 'Search tasks' });
    await expect(searchButton).toBeVisible({ timeout: 90_000 });
    await searchButton.click();
  }

  await expect(searchbox).toBeVisible({ timeout: 90_000 });
  await searchbox.fill(taskTitle);
}

async function ensureBoardViewMode(page: Page): Promise<void> {
  const board = page.getByTestId('tasks-board');
  if (await board.isVisible({ timeout: 10_000 }).catch(() => false)) {
    return;
  }

  const displayOptions = page.getByRole('button', { name: 'Display options' });
  await expect(displayOptions).toBeVisible({ timeout: 90_000 });
  await displayOptions.click();
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(board).toBeVisible({ timeout: 90_000 });
}

async function selectTaskMetaOption(
  page: Page,
  triggerName: string,
  optionName: string
): Promise<void> {
  await page.getByLabel(triggerName).click();
  await page.getByRole('menuitem', { name: optionName }).click();
}

async function assertTasksBoardLayout(
  page: Page,
  testInfo: TestInfo,
  viewport: (typeof VIEWPORTS)[number]
): Promise<void> {
  const { title: taskTitle } = await ensureTaskExists();

  await setTaskViewMode(page, 'board');
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  await gotoTasksRoute(page);
  await expect(page.getByTestId('tasks-workspace')).toBeVisible({
    timeout: 30_000,
  });
  await ensureBoardViewMode(page);
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
  const { title: taskTitle } = await ensureTaskExists();

  await setTaskViewMode(page, 'list');
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });

  await gotoTasksRoute(page);
  await expect(page.getByTestId('tasks-workspace')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('task-list-pane')).toBeVisible({
    timeout: 30_000,
  });

  await fillTaskSearch(page, taskTitle);

  const targetRow = getTaskRowByTitle(page, taskTitle);

  const workspace = page.getByTestId('tasks-workspace');
  const listPane = page.getByTestId('task-list-pane');
  const dashboardHeader = page.getByTestId('dashboard-header');
  const subheader = page.getByTestId('tasks-workspace-subheader');

  await expect(listPane).toBeVisible();
  await expect(targetRow).toBeVisible({ timeout: 30_000 });

  const [
    headerBox,
    subheaderBox,
    workspaceBox,
    paneBox,
    rowBox,
    listFitsWithoutScroll,
    pageFitsWithoutScroll,
  ] = await Promise.all([
    dashboardHeader.boundingBox(),
    subheader.boundingBox(),
    workspace.boundingBox(),
    listPane.boundingBox(),
    targetRow.boundingBox(),
    listPane.evaluate(node => node.scrollWidth <= node.clientWidth + 1),
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    ),
  ]);

  expect(headerBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  expect(paneBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  expect(listFitsWithoutScroll).toBe(true);
  expect(pageFitsWithoutScroll).toBe(true);

  if (subheaderBox) {
    expect(
      Math.abs((headerBox?.height ?? 0) - subheaderBox.height)
    ).toBeLessThanOrEqual(1);
  }
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
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }, testInfo) => {
    if (
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1' &&
      !hasClerkCredentials()
    ) {
      testInfo.skip();
      return;
    }

    await stubPassiveTracking(page);
    if (process.env.E2E_USE_TEST_AUTH_BYPASS === '1') {
      await seedTaskLayoutBypassSession(page);
      return;
    }

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

    test(`defaults fresh visits to list mode at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      const { title: taskTitle } = await ensureTaskExists();

      await clearTaskViewMode(page);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await gotoTasksRoute(page);
      await expect(page.getByTestId('tasks-workspace')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('task-list-pane')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId('tasks-board')).not.toBeVisible();
      await expect(page.getByTestId('task-document-pane')).toBeVisible({
        timeout: 90_000,
      });
      await expect(
        page.getByText('Pick a task from the list to see what it needs.')
      ).toBeVisible();

      const targetRow = getTaskRowByTitle(page, taskTitle);
      await expect(targetRow).toBeVisible({ timeout: 30_000 });
      await targetRow.click();

      await expect(getVisibleTaskTitleEditor(page)).toHaveValue(taskTitle, {
        timeout: 15_000,
      });

      await page.getByRole('button', { name: 'Display options' }).click();
      await page.getByRole('button', { name: 'Board view' }).click();

      await expect(page.getByTestId('tasks-board')).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByTestId('tasks-board-column-backlog')).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(taskTitle).first()).toBeVisible({
        timeout: 30_000,
      });

      await testInfo.attach(`tasks-default-list-${viewport.name}`, {
        body: await page.getByTestId('tasks-workspace').screenshot(),
        contentType: 'image/png',
      });
    });
  }

  test('persists board item edits after rapid title and metadata changes', async ({
    page,
  }, testInfo) => {
    const { id: taskId, title: taskTitle } = await ensureTaskExists();
    const editedTitle = `${LAYOUT_TASK_TITLE} ${Date.now()}`;

    await setTaskViewMode(page, 'board');
    await page.setViewportSize({ width: 1440, height: 960 });

    await gotoTasksRoute(page);
    await expect(page.getByTestId('tasks-workspace')).toBeVisible({
      timeout: 30_000,
    });
    await ensureBoardViewMode(page);

    const boardCard = getTaskBoardCardByTitle(page, taskTitle);
    await expect(boardCard).toBeVisible({ timeout: 30_000 });
    await boardCard.click();

    const titleEditor = getVisibleTaskTitleEditor(page);
    await expect(titleEditor).toHaveValue(taskTitle, { timeout: 15_000 });
    await titleEditor.fill(editedTitle);

    await selectTaskMetaOption(page, 'Change task priority', 'Urgent');
    await selectTaskMetaOption(page, 'Change task assignee', 'Jovie');
    await selectTaskMetaOption(page, 'Change task status', 'In Progress');

    await expect
      .poll(() => getSeededTaskState(taskId), {
        timeout: 30_000,
        message: 'task item edits should persist to the database',
      })
      .toMatchObject({
        title: editedTitle,
        status: 'in_progress',
        priority: 'urgent',
        assigneeKind: 'jovie',
      });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tasks-workspace')).toBeVisible({
      timeout: 30_000,
    });
    await ensureBoardViewMode(page);

    const movedCard = page
      .getByTestId('tasks-board-column-in_progress')
      .locator(TASK_BOARD_CARD_SELECTOR)
      .filter({ hasText: editedTitle })
      .first();
    await expect(movedCard).toBeVisible({ timeout: 30_000 });
    await expect(movedCard).toContainText('Urgent');
    await expect(movedCard).toContainText('Jovie');

    await testInfo.attach('tasks-board-persisted-item-edit', {
      body: await page.getByTestId('tasks-workspace').screenshot(),
      contentType: 'image/png',
    });
  });
});
