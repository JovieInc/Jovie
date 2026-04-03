import { neon } from '@neondatabase/serverless';
import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
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

  const sql = neon(databaseUrl);
  await sql`
    with profile as (
      select id
      from creator_profiles
      where username = 'e2e-test-user'
      limit 1
    ),
    existing_task as (
      select id
      from tasks
      where creator_profile_id = (select id from profile)
        and title = ${LAYOUT_TASK_TITLE}
        and deleted_at is null
      limit 1
    )
    insert into tasks (
      creator_profile_id,
      task_number,
      title,
      description,
      status,
      priority,
      assignee_kind,
      agent_status,
      position,
      metadata
    )
    select
      profile.id,
      coalesce(
        (
          select max(task_number) + 1
          from tasks
          where creator_profile_id = profile.id
        ),
        1
      ),
      ${LAYOUT_TASK_TITLE},
      'Used by the Playwright tasks layout spec.',
      'in_progress',
      'high',
      'human',
      'approved',
      coalesce(
        (
          select max(position) + 1
          from tasks
          where creator_profile_id = profile.id
        ),
        0
      ),
      '{}'::jsonb
    from profile
    where not exists (select 1 from existing_task)
  `;

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

  const [headerBox, subheaderBox, paneBox, rowBox, hasOverflow] =
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
  expect(hasOverflow).toBe(true);

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
