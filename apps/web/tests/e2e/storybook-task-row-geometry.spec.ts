import { expect, test } from '@playwright/test';

const STORY_ID = 'dashboard-tasks-taskdatatable--multiline-task-rows';
const VIEWPORTS = [
  { name: 'normal desktop split', width: 1280 },
  { name: 'narrow desktop split', width: 390 },
] as const;

test.describe('Tasks multiline row geometry', () => {
  for (const viewport of VIEWPORTS) {
    test(`keeps title and wrapped metadata visible in a ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: 820 });
      await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(page.locator('#storybook-root')).not.toBeEmpty({
        timeout: 60_000,
      });
      await expect(page.getByTestId('task-row-geometry-frame')).toBeVisible();

      const rowBounds: Array<{ top: number; bottom: number }> = [];
      for (const taskId of ['task-row-short', 'task-row-long']) {
        const row = page.getByTestId(`task-list-row-${taskId}`);
        const title = row.locator('p');
        const metadata = row.getByTestId(`task-list-row-meta-${taskId}`);

        await expect(title).toBeVisible();
        await expect(metadata).toBeVisible();

        const geometry = await row.evaluate(element => {
          const tableRow = element.closest('tr');
          const cellContent = tableRow?.querySelector<HTMLElement>(
            '[data-table-cell-content="stable"]'
          );
          const titleElement = element.querySelector<HTMLElement>('p');
          const metadataElement = element.querySelector<HTMLElement>(
            '[data-testid^="task-list-row-meta-"]'
          );
          if (!cellContent || !titleElement || !metadataElement) return null;

          const rect = (node: HTMLElement) => {
            const bounds = node.getBoundingClientRect();
            return { top: bounds.top, bottom: bounds.bottom };
          };
          const metadataChildTops = Array.from(metadataElement.children)
            .map(child => child.getBoundingClientRect().top)
            .sort((left, right) => left - right);
          const metadataRows = metadataChildTops.reduce<number[]>(
            (rows, top) => {
              if (rows.length === 0 || top - rows[rows.length - 1]! >= 8) {
                rows.push(top);
              }
              return rows;
            },
            []
          ).length;
          return {
            row: rect(tableRow as HTMLElement),
            cell: rect(cellContent),
            title: rect(titleElement),
            metadata: rect(metadataElement),
            metadataRows,
            cellOverflowY: getComputedStyle(cellContent).overflowY,
            cellScrollHeight: cellContent.scrollHeight,
            cellClientHeight: cellContent.clientHeight,
            metadataScrollHeight: metadataElement.scrollHeight,
            metadataClientHeight: metadataElement.clientHeight,
          };
        });

        expect(geometry, `${taskId} rendered geometry`).not.toBeNull();
        if (!geometry) continue;
        rowBounds.push(geometry.row);
        expect(
          geometry.title.top,
          `${taskId} title stays within its row: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.row.top - 2);
        expect(
          geometry.title.bottom,
          `${taskId} title stays within its row: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.row.bottom + 2);
        expect(
          geometry.metadata.top,
          `${taskId} metadata stays within its row: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.row.top - 2);
        expect(
          geometry.metadata.bottom,
          `${taskId} metadata stays within its row: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.row.bottom + 2);
        expect(
          geometry.metadataRows,
          `${taskId} exercises wrapped metadata: ${JSON.stringify(geometry)}`
        ).toBeGreaterThan(1);
        expect(
          geometry.title.top,
          `${taskId} title top: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.cell.top - 2);
        expect(
          geometry.title.bottom,
          `${taskId} title bottom: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.cell.bottom + 2);
        expect(
          geometry.metadata.top,
          `${taskId} metadata top: ${JSON.stringify(geometry)}`
        ).toBeGreaterThanOrEqual(geometry.cell.top - 2);
        expect(
          geometry.metadata.bottom,
          `${taskId} metadata bottom: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.cell.bottom + 2);
        expect(
          geometry.cellScrollHeight,
          `${taskId} cell content clips overflow: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.cellClientHeight + 1);
        expect(
          geometry.metadataScrollHeight,
          `${taskId} metadata clips overflow: ${JSON.stringify(geometry)}`
        ).toBeLessThanOrEqual(geometry.metadataClientHeight + 1);
      }
      expect(rowBounds).toHaveLength(2);
      expect(rowBounds[0]!.bottom).toBeLessThanOrEqual(rowBounds[1]!.top + 1);
    });
  }
});

test('keeps default table cell content at its canonical single-line height', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(
    '/iframe.html?id=dashboard-tasks-taskdatatable--default&viewMode=story',
    {
      waitUntil: 'domcontentloaded',
    }
  );

  const cellContent = page
    .locator('[data-table-cell-content="stable"]')
    .first();
  await expect(cellContent).toBeVisible();
  const cellHeight = await cellContent.evaluate(
    element => element.getBoundingClientRect().height
  );
  expect(cellHeight).toBe(32);
});
