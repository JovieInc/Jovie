/**
 * Geometry regression for the shared dashboard header.
 *
 * A header rail control may reserve width, but it must never precede the
 * title or move the title off the workspace/table seam. This checks the
 * rendered desktop geometry rather than relying on Tailwind class order.
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

const SEAM_TOLERANCE_PX = 1;

test.use({ storageState: { cookies: [], origins: [] } });

test('Connections header, toolbar, and first table cell share the workspace seam', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await setTestAuthBypassSession(page, 'creator-ready');
  await smokeNavigateWithRetry(page, APP_ROUTES.PROFILES, {
    waitUntil: 'domcontentloaded',
  });

  const workspace = page.getByTestId('profiles-workspace');
  const heading = page.getByRole('heading', { name: 'Connections' });
  const toolbar = page.getByTestId('connections-workspace-toolbar');
  const firstCell = workspace.locator('tbody tr td').first();

  await expect(workspace).toBeVisible({ timeout: 30_000 });
  await expect(heading).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(firstCell).toBeVisible({ timeout: 30_000 });

  const [workspaceBox, headingBox, toolbarBox, firstCellBox] =
    await Promise.all([
      workspace.boundingBox(),
      heading.boundingBox(),
      toolbar.boundingBox(),
      firstCell.boundingBox(),
    ]);

  expect(workspaceBox).not.toBeNull();
  expect(headingBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(firstCellBox).not.toBeNull();

  const seamX = (workspaceBox?.x ?? 0) + 1;
  for (const [label, x] of [
    ['Connections heading', headingBox?.x ?? 0],
    ['Connections toolbar', toolbarBox?.x ?? 0],
    ['Connections first table cell', firstCellBox?.x ?? 0],
  ] as const) {
    expect(
      Math.abs(x - seamX),
      `${label} must remain on the workspace seam (expected ${seamX}px, received ${x}px)`
    ).toBeLessThanOrEqual(SEAM_TOLERANCE_PX);
  }
});
