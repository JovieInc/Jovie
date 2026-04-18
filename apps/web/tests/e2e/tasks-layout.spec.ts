import { neon } from '@neondatabase/serverless';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { APP_ROUTES } from '@/constants/routes';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { tasks } from '@/lib/db/schema/tasks';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';

const LAYOUT_TASK_TITLE = 'Layout QA task fixture';
const TASK_ROW_SELECTOR =
  '[data-testid^="task-list-row-"]:not([data-testid^="task-list-row-meta-"])';
const VIEWPORTS = [
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 960 },
] as const;

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

  const db = drizzle(neon(databaseUrl), {
    schema: { creatorProfiles, tasks },
  });
  const [profile] = await db
    .select({ id: creatorProfiles.id })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.username, 'e2e-test-user'))
    .limit(1);

  if (!profile) {
    throw new Error('Could not find the e2e-test-user creator profile.');
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

  if (!existingTask) {
    const [lastTaskNumber] = await db
      .select({ taskNumber: tasks.taskNumber })
      .from(tasks)
      .where(eq(tasks.creatorProfileId, profile.id))
      .orderBy(desc(tasks.taskNumber))
      .limit(1);

    const [lastPosition] = await db
      .select({ position: tasks.position })
      .from(tasks)
      .where(eq(tasks.creatorProfileId, profile.id))
      .orderBy(desc(tasks.position))
      .limit(1);

    await db.insert(tasks).values({
      creatorProfileId: profile.id,
      taskNumber: (lastTaskNumber?.taskNumber ?? 0) + 1,
      title: LAYOUT_TASK_TITLE,
      description: 'Used by the Playwright tasks layout spec.',
      status: 'in_progress',
      priority: 'high',
      assigneeKind: 'human',
      agentStatus: 'approved',
      position: (lastPosition?.position ?? -1) + 1,
      metadata: {},
    });
  }

  return LAYOUT_TASK_TITLE;
}

async function openFirstTask(page: Page): Promise<void> {
  const selectedRow = page.locator(
    `${TASK_ROW_SELECTOR}[data-selected="true"]`
  );

  if ((await selectedRow.count()) > 0) {
    return;
  }

  const firstRow = page.locator(TASK_ROW_SELECTOR).first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
}

async function assertTasksLayout(
  page: Page,
  testInfo: TestInfo,
  viewport: (typeof VIEWPORTS)[number]
): Promise<void> {
  const taskTitle = await ensureTaskExists();

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

  await expect(page.getByText(taskTitle).first()).toBeVisible({
    timeout: 15_000,
  });
  await openFirstTask(page);

  const listPane = page.getByTestId('task-list-pane');
  const documentPane = page.getByTestId('task-document-pane');
  const dashboardHeader = page.getByTestId('dashboard-header');
  const subheader = page.getByTestId('tasks-workspace-subheader');
  const selectedRow = page.locator(
    `${TASK_ROW_SELECTOR}[data-selected="true"]`
  );

  await expect(listPane).toBeVisible();
  await expect(documentPane).toBeVisible();
  await expect(selectedRow).toBeVisible();
  await expect(page.getByLabel('Task title')).toBeVisible();

  const [headerBox, subheaderBox, paneBox, rowBox, fitsWithoutScroll] =
    await Promise.all([
      dashboardHeader.boundingBox(),
      subheader.boundingBox(),
      listPane.boundingBox(),
      selectedRow.boundingBox(),
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
    test(`keeps the split contained at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await assertTasksLayout(page, testInfo, viewport);
    });
  }
});
